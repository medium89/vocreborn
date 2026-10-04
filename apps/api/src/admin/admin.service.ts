import { COSMETIC_KEYS, COSMETIC_DEFAULTS, type CosmeticKey } from "../gifts/cosmetics";
import { ChatSettingsService } from "../settings/chat-settings.service";
import { ChatService } from "../chat/chat.service";
import { randomUUID } from "node:crypto";
import { statfs } from "node:fs/promises";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type Gender, type UserRole } from "@prisma/client";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ProfileService } from "../auth/profile.service";
import { PrismaService } from "../database/prisma.service";
import { SessionRevocationService } from "../security/session-revocation.service";

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly revocations: SessionRevocationService,
    private readonly profiles: ProfileService,
    private readonly chatSettings: ChatSettingsService,
    private readonly chat: ChatService,
  ) {}

  async overview(actor: AuthenticatedUser) {
    this.requireAdmin(actor);
    const [users, rooms, messages, reports, attachments, profilePosts] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.room.count(),
      this.prisma.message.count({ where: { deletedAt: null } }),
      this.prisma.report.count({ where: { status: "OPEN" } }),
      this.prisma.attachment.count({ where: { status: "PENDING" } }),
      this.prisma.profilePost.count({ where: { deletedAt: null } }),
    ]);
    return { users, rooms, messages, openReports: reports, pendingAttachments: attachments, profilePosts };
  }

  async users(actor: AuthenticatedUser, query?: string) {
    this.requireAdmin(actor);
    const search = typeof query === "string" ? query.trim().slice(0, 64) : "";
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        ...(search
          ? { OR: [{ username: { contains: search, mode: "insensitive" as const } }, { displayName: { contains: search, mode: "insensitive" as const } }] }
          : { status: { in: ["ONLINE", "AWAY", "DND"] as const } }),
      },
      take: 100,
      orderBy: { createdAt: "desc" },
      select: { id: true, username: true, displayName: true, role: true, isDj: true, status: true, createdAt: true, _count: { select: { messages: true, reportsReceived: true } } },
    });
    return users.map((user) => ({ ...user, role: user.role.toLowerCase(), status: user.status.toLowerCase(), createdAt: user.createdAt.toISOString() }));
  }

  async userDetail(actor: AuthenticatedUser, id: string) {
    this.requireStaff(actor);
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true, username: true, displayName: true, bio: true, gender: true, role: true, isDj: true, status: true,
        cosmetics: { select: { effectKey: true, settings: true } },
        rating: true, credits: true, avatarKey: true, isGuest: true, isBot: true, createdAt: true, updatedAt: true,
        _count: { select: { messages: true, profilePosts: true, reportsReceived: true } },
      },
    });
    if (!user) throw new NotFoundException("Пользователь не найден");
    const baseUrl = process.env.PUBLIC_API_URL ?? "http://localhost:3001";
    return {
      ...user, gender: user.gender.toLowerCase(), role: user.role.toLowerCase(), status: user.status.toLowerCase(),
      avatarUrl: user.avatarKey ? baseUrl + user.avatarKey : null,
      avatarKey: undefined,
      createdAt: user.createdAt.toISOString(), updatedAt: user.updatedAt.toISOString(),
    };
  }

  async updateUser(actor: AuthenticatedUser, id: string, input: {
    username?: string; displayName?: string; bio?: string; gender?: Gender; role?: UserRole; rating?: number; credits?: number;
  }) {
    this.requireAdmin(actor);
    if (id === actor.id && input.role && input.role !== "ADMIN")
      throw new BadRequestException("Нельзя снять права администратора у своей текущей сессии");
    const target = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!target) throw new NotFoundException("Пользователь не найден");
    const data = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as typeof input;
    if (Object.keys(data).length === 0) throw new BadRequestException("Нет изменений");
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${id}::uuid FOR UPDATE`;
        const fresh = await tx.user.findUniqueOrThrow({ where: { id } });
        if (data.displayName) {
          const duplicate = await tx.user.findFirst({ where: { displayName: { equals: data.displayName.trim(), mode: "insensitive" }, id: { not: id }, deletedAt: null }, select: { id: true } });
          if (duplicate) throw new BadRequestException("Отображаемое имя уже занято");
        }
        await tx.user.update({ where: { id }, data });
        if (data.credits !== undefined && data.credits !== fresh.credits) await tx.economyEntry.create({ data: { userId: id, type: "ADMIN_ADJUSTMENT", creditsDelta: data.credits - fresh.credits, balanceAfter: data.credits, referenceKey: "admin-edit:" + randomUUID() } });
        if (data.role && data.role !== target.role) await tx.session.deleteMany({ where: { userId: id } });
        await tx.moderationAudit.create({
          data: {
            actorId: actor.id, action: "USER_EDIT", targetUserId: id,
            details: {
              fields: Object.keys(data),
              before: Object.fromEntries(Object.keys(data).map((field) => [field, fresh[field as keyof typeof fresh]])),
              after: data,
            },
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        throw new BadRequestException("Этот логин уже занят");
      throw error;
    }
    if (data.role && data.role !== target.role) this.revocations.revokeUser(id);
    return this.userDetail(actor, id);
  }

  async uploadUserAvatar(actor: AuthenticatedUser, id: string, file?: { buffer: Buffer; mimetype: string; size: number }) {
    this.requireAdmin(actor);
    const target = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!target) throw new NotFoundException("Пользователь не найден");
    await this.profiles.saveAvatar(id, file);
    await this.prisma.moderationAudit.create({ data: { actorId: actor.id, action: "USER_AVATAR_EDIT", targetUserId: id } });
    return this.userDetail(actor, id);
  }

  async removeUserAvatar(actor: AuthenticatedUser, id: string) {
    this.requireAdmin(actor);
    const target = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!target) throw new NotFoundException("Пользователь не найден");
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { avatarKey: null, avatarThumbKey: null } });
      await tx.moderationAudit.create({ data: { actorId: actor.id, action: "USER_AVATAR_REMOVE", targetUserId: id } });
    });
    return this.userDetail(actor, id);
  }

  async setRole(actor: AuthenticatedUser, id: string, role: UserRole) {
    this.requireAdmin(actor);
    if (id === actor.id && role !== "ADMIN") throw new BadRequestException("Нельзя снять права администратора у своей текущей сессии");
    const target = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!target) throw new NotFoundException("Пользователь не найден");
    const updated = await this.prisma.$transaction(async (prisma) => {
      const user = await prisma.user.update({ where: { id }, data: { role } });
      await prisma.session.deleteMany({ where: { userId: id } });
      await prisma.moderationAudit.create({
        data: { actorId: actor.id, action: "ROLE_CHANGE", targetUserId: id, details: { from: target.role, to: role } },
      });
      return user;
    });
    this.revocations.revokeUser(id);
    return { id: updated.id, role: updated.role.toLowerCase() };
  }

  async deactivate(actor: AuthenticatedUser, id: string) {
    this.requireAdmin(actor);
    if (id === actor.id) throw new BadRequestException("Нельзя отключить собственный аккаунт");
    const target = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!target) throw new NotFoundException("Пользователь не найден");
    if (target.role === "ADMIN") throw new ForbiddenException("Нельзя отключить аккаунт администратора");
    await this.prisma.$transaction(async (prisma) => {
      await prisma.user.update({ where: { id }, data: { deletedAt: new Date(), status: "OFFLINE" } });
      await prisma.session.deleteMany({ where: { userId: id } });
      await prisma.moderationAudit.create({
        data: { actorId: actor.id, action: "USER_DEACTIVATE", targetUserId: id, details: { username: target.username } },
      });
    });
    this.revocations.revokeUser(id);
    return { id, deactivated: true };
  }


  async settings(actor: AuthenticatedUser) { this.requireAdmin(actor); return this.chatSettings.read(); }
  async saveSettings(actor: AuthenticatedUser, input: { settings: Record<string, unknown>; version: number; reason: string }) {
    this.requireAdmin(actor); return this.chatSettings.save(actor, input.settings, input.version, input.reason);
  }
  async adjustCredits(actor: AuthenticatedUser, id: string, input: { mode: "add" | "remove" | "set"; amount: number; reason: string; requestId: string }) {
    this.requireAdmin(actor);
    if (input.reason.trim().length < 2) throw new BadRequestException("Укажите причину операции");
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.requestId}, 17))`;
      await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${id}::uuid FOR UPDATE`;
      const target = await tx.user.findFirst({ where: { id, deletedAt: null } });
      if (!target) throw new NotFoundException("Пользователь не найден");
      const key = "admin:" + input.requestId;
      const existing = await tx.economyEntry.findUnique({ where: { referenceKey: key } });
      if (existing) {
        const audit = await tx.moderationAudit.findFirst({ where: { action: "CREDITS_ADJUST", targetUserId: id, details: { path: ["requestId"], equals: input.requestId } } });
        const details = audit?.details as { mode?: string; amount?: number; reason?: string } | null;
        if (existing.userId !== id || audit?.actorId !== actor.id || details?.mode !== input.mode || details?.amount !== input.amount || details?.reason !== input.reason.trim()) throw new ConflictException("Идентификатор операции уже использован");
        return { credits: target.credits, entryId: existing.id, duplicate: true };
      }
      const balance = input.mode === "set" ? input.amount : target.credits + (input.mode === "add" ? input.amount : -input.amount);
      if (balance < 0 || balance > 2147483647) throw new BadRequestException("Недостаточно кредитов или превышен максимальный баланс");
      await tx.user.update({ where: { id }, data: { credits: balance } });
      const entry = await tx.economyEntry.create({ data: { userId: id, type: "ADMIN_ADJUSTMENT", creditsDelta: balance - target.credits, balanceAfter: balance, referenceKey: key } });
      await tx.moderationAudit.create({ data: { actorId: actor.id, targetUserId: id, action: "CREDITS_ADJUST", details: { ...input, reason: input.reason.trim(), before: target.credits, after: balance, entryId: entry.id } } });
      return { credits: balance, entryId: entry.id, duplicate: false };
    });
  }
  async economy(actor: AuthenticatedUser, userId?: string, cursor?: string) {
    this.requireAdmin(actor);
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (userId && !uuid.test(userId) || cursor && !uuid.test(cursor)) throw new BadRequestException("Некорректный идентификатор");
    if (cursor && !await this.prisma.economyEntry.findUnique({ where: { id: cursor } })) throw new BadRequestException("Страница журнала устарела");
    const items = await this.prisma.economyEntry.findMany({ where: userId ? { userId } : {}, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), include: { user: { select: { id: true, displayName: true, username: true } } } });
    return { items: items.slice(0, 50), nextCursor: items.length > 50 ? items[49].id : null };
  }
  async cosmetics(actor: AuthenticatedUser, id: string, input: { effectKey: string; action: "grant" | "revoke"; reason: string }) {
    this.requireAdmin(actor);
    if (!COSMETIC_KEYS.includes(input.effectKey as CosmeticKey) || input.reason.trim().length < 2) throw new BadRequestException("Укажите допустимый эффект и причину");
    await this.prisma.$transaction(async tx => {
      const user = await tx.user.findFirst({ where: { id, deletedAt: null } });
      if (!user) throw new NotFoundException("Пользователь не найден");
      if (input.action === "grant") await tx.userCosmetic.upsert({ where: { userId_effectKey: { userId: id, effectKey: input.effectKey } }, create: { userId: id, effectKey: input.effectKey, settings: COSMETIC_DEFAULTS[input.effectKey as CosmeticKey] }, update: {} });
      else await tx.userCosmetic.deleteMany({ where: { userId: id, effectKey: input.effectKey } });
      await tx.moderationAudit.create({ data: { actorId: actor.id, targetUserId: id, action: "COSMETIC_ADMIN", details: { ...input, reason: input.reason.trim() } } });
    });
    return this.userDetail(actor, id);
  }
  async revokeSessions(actor: AuthenticatedUser, id: string) {
    this.requireAdmin(actor);
    await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${id}::uuid FOR UPDATE`;
      const target = await tx.user.findFirst({ where: { id, deletedAt: null } });
      if (!target) throw new NotFoundException("Пользователь не найден");
      if (target.role === "ADMIN") throw new ForbiddenException("Нельзя завершать сеансы администратора");
      await tx.session.deleteMany({ where: { userId: id } });
      await tx.user.update({ where: { id }, data: { status: "OFFLINE" } });
      await tx.moderationAudit.create({ data: { actorId: actor.id, targetUserId: id, action: "SESSIONS_REVOKE" } });
    });
    this.revocations.revokeUser(id); return { revoked: true };
  }
  async system(actor: AuthenticatedUser) {
    this.requireAdmin(actor);
    const start = Date.now(); await this.prisma.$queryRaw`SELECT 1`;
    const memory = process.memoryUsage();
    const disk = await statfs(process.cwd()).catch(() => null);
    return { uptimeSeconds: Math.floor(process.uptime()), databaseMs: Date.now() - start, memoryMb: Math.round(memory.rss / 1048576), diskFreeMb: disk ? Math.round(disk.bavail * disk.bsize / 1048576) : null,
      modules: { radio: process.env.TUSOVA_RADIO_ENABLED === "true", quiz: process.env.TUSOVA_QUIZ_ENABLED === "true", testBots: process.env.TUSOVA_BOTS_ENABLED === "true" && process.env.NODE_ENV !== "production" },
      environment: process.env.NODE_ENV ?? "development" };
  }
  async content(actor: AuthenticatedUser, query?: string) {
    this.requireAdmin(actor);
    const search = query?.trim().slice(0, 100) ?? "";
    return this.prisma.message.findMany({ where: { deletedAt: null, room: { is: { visibility: "PUBLIC" } }, ...(search ? { OR: [{ body: { contains: search, mode: "insensitive" } }, { authorName: { contains: search, mode: "insensitive" } }] } : {}) }, take: 50, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, authorName: true, body: true, createdAt: true, room: { select: { name: true } } } });
  }
  async announce(actor: AuthenticatedUser, input: { body: string; requestId: string }) {
    this.requireAdmin(actor);
    if (!input.body.trim()) throw new BadRequestException("Введите текст объявления");
    return this.chat.createMessage("main", input.body, "announcement:" + input.requestId, actor.id, actor.displayName, undefined, undefined, true);
  }

  private requireStaff(actor: AuthenticatedUser) {
    if (actor.role !== "admin" && actor.role !== "moderator") throw new ForbiddenException("Требуются права модератора");
  }

  private requireAdmin(actor: AuthenticatedUser) {
    if (actor.role !== "admin") throw new ForbiddenException("Требуются права администратора");
  }
}
