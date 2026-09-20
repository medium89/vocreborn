import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { UserRole } from "@prisma/client";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../database/prisma.service";
import { SessionRevocationService } from "../security/session-revocation.service";

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly revocations: SessionRevocationService,
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

  async users(actor: AuthenticatedUser) {
    this.requireAdmin(actor);
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, username: true, displayName: true, role: true, status: true, createdAt: true, _count: { select: { messages: true, reportsReceived: true } } },
    });
    return users.map((user) => ({ ...user, role: user.role.toLowerCase(), status: user.status.toLowerCase(), createdAt: user.createdAt.toISOString() }));
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

  private requireAdmin(actor: AuthenticatedUser) {
    if (actor.role !== "admin") throw new ForbiddenException("Требуются права администратора");
  }
}
