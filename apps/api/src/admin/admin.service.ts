import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
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
      orderBy: { createdAt: "desc" },
      select: { id: true, username: true, displayName: true, role: true, status: true, createdAt: true, _count: { select: { messages: true, reportsReceived: true } } },
    });
    return users.map((user) => ({ ...user, role: user.role.toLowerCase(), status: user.status.toLowerCase(), createdAt: user.createdAt.toISOString() }));
  }

  async userDetail(actor: AuthenticatedUser, id: string) {
    this.requireStaff(actor);
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true, username: true, displayName: true, bio: true, gender: true, role: true, status: true,
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
        await tx.user.update({ where: { id }, data });
        if (data.role && data.role !== target.role) await tx.session.deleteMany({ where: { userId: id } });
        await tx.moderationAudit.create({
          data: {
            actorId: actor.id, action: "USER_EDIT", targetUserId: id,
            details: {
              fields: Object.keys(data),
              before: Object.fromEntries(Object.keys(data).map((field) => [field, target[field as keyof typeof target]])),
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

  private requireStaff(actor: AuthenticatedUser) {
    if (actor.role !== "admin" && actor.role !== "moderator") throw new ForbiddenException("Требуются права модератора");
  }

  private requireAdmin(actor: AuthenticatedUser) {
    if (actor.role !== "admin") throw new ForbiddenException("Требуются права администратора");
  }
}
