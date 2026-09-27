import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../database/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationType } from "@prisma/client";
import type { BanUserDto, MuteUserDto } from "./moderation.dto";

@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) {}

  async mute(actor: AuthenticatedUser, input: MuteUserDto, reportId?: string) {
    const target = await this.assertTarget(actor, input.userId);
    if (target.role !== "USER" && actor.role !== "admin") {
      throw new ForbiddenException("Модератор не может ограничить администратора или модератора");
    }

    const expiresAt = new Date(Date.now() + input.durationMinutes * 60_000);
    const mute = await this.prisma.$transaction(async (prisma) => {
      await prisma.mute.deleteMany({ where: { userId: target.id, expiresAt: { gt: new Date() } } });
      const created = await prisma.mute.create({
        data: { userId: target.id, moderatorId: actor.id, reason: input.reason, expiresAt },
      });
      await prisma.moderationAudit.create({
        data: {
          actorId: actor.id,
          action: "MUTE",
          targetUserId: target.id,
          reportId,
          details: { durationMinutes: input.durationMinutes, reason: input.reason || null },
        },
      });
      return created;
    });
    await this.notifications.createEvent({ userId: target.id, actorId: actor.id, type: NotificationType.MUTE, metadata: { preview: input.reason || "Ограничение на отправку сообщений" } });
    return { userId: target.id, mutedUntil: mute.expiresAt.toISOString() };
  }

  async unmute(actor: AuthenticatedUser, userId: string) {
    await this.assertTarget(actor, userId);
    await this.prisma.$transaction([
      this.prisma.mute.deleteMany({ where: { userId, expiresAt: { gt: new Date() } } }),
      this.prisma.moderationAudit.create({
        data: { actorId: actor.id, action: "UNMUTE", targetUserId: userId },
      }),
    ]);
    await this.notifications.createEvent({ userId, actorId: actor.id, type: NotificationType.UNMUTE });
    return { userId, mutedUntil: null };
  }

  async imposeChaos(actor: AuthenticatedUser, input: MuteUserDto, reportId?: string) {
    const target = await this.assertTarget(actor, input.userId);
    if (target.role !== "USER" && actor.role !== "admin") {
      throw new ForbiddenException("Модератор не может ограничить администратора или модератора");
    }
    const expiresAt = new Date(Date.now() + input.durationMinutes * 60_000);
    await this.prisma.$transaction(async (prisma) => {
      await prisma.chaos.updateMany({
        where: { userId: target.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await prisma.chaos.create({
        data: { userId: target.id, moderatorId: actor.id, reason: input.reason, expiresAt },
      });
      await prisma.moderationAudit.create({
        data: {
          actorId: actor.id,
          action: "CHAOS",
          targetUserId: target.id,
          reportId,
          details: { durationMinutes: input.durationMinutes, reason: input.reason || null },
        },
      });
    });
    return { userId: target.id, chaosUntil: expiresAt.toISOString() };
  }

  async removeChaos(actor: AuthenticatedUser, userId: string) {
    const target = await this.assertTarget(actor, userId);
    if (target.role !== "USER" && actor.role !== "admin") {
      throw new ForbiddenException("Модератор не может снять ограничение с администратора или модератора");
    }
    await this.prisma.$transaction([
      this.prisma.chaos.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
      this.prisma.moderationAudit.create({ data: { actorId: actor.id, action: "UNCHAOS", targetUserId: userId } }),
    ]);
    return { userId, chaosUntil: null };
  }

  async ban(actor: AuthenticatedUser, input: BanUserDto, reportId?: string) {
    this.requireAdmin(actor);
    const target = await this.assertTarget(actor, input.userId);
    const expiresAt = input.durationMinutes ? new Date(Date.now() + input.durationMinutes * 60_000) : null;

    const ban = await this.prisma.$transaction(async (prisma) => {
      await prisma.ban.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: new Date() } });
      const created = await prisma.ban.create({
        data: { userId: target.id, moderatorId: actor.id, reason: input.reason, expiresAt },
      });
      await prisma.session.deleteMany({ where: { userId: target.id } });
      await prisma.user.update({ where: { id: target.id }, data: { status: "OFFLINE" } });
      await prisma.moderationAudit.create({
        data: {
          actorId: actor.id,
          action: "BAN",
          targetUserId: target.id,
          reportId,
          details: { durationMinutes: input.durationMinutes || null, reason: input.reason || null },
        },
      });
      return created;
    });
    await this.notifications.createEvent({ userId: target.id, actorId: actor.id, type: NotificationType.BAN, metadata: { preview: input.reason || "Аккаунт заблокирован" } });
    return { userId: target.id, banned: true, expiresAt: ban.expiresAt?.toISOString() ?? null };
  }

  async unban(actor: AuthenticatedUser, userId: string) {
    this.requireAdmin(actor);
    await this.assertTarget(actor, userId);
    await this.prisma.$transaction([
      this.prisma.ban.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
      this.prisma.moderationAudit.create({
        data: { actorId: actor.id, action: "UNBAN", targetUserId: userId },
      }),
    ]);
    await this.notifications.createEvent({ userId, actorId: actor.id, type: NotificationType.UNBAN });
    return { userId, banned: false };
  }

  async deletePublicMessage(actor: AuthenticatedUser, messageId: string, reportId?: string) {
    this.requireModerator(actor);
    const message = await this.prisma.message.findUnique({ where: { id: messageId }, include: { author: true } });
    if (!message || message.deletedAt) throw new NotFoundException("Сообщение не найдено");
    if (!message.roomId) throw new BadRequestException("Удаление личных сообщений через модерацию запрещено");
    if (message.kind === "SYSTEM" && actor.role !== "admin") {
      throw new ForbiddenException("Системные сообщения может удалять только администратор");
    }
    if (message.author?.role !== "USER" && actor.role !== "admin") {
      throw new ForbiddenException("Модератор не может удалить сообщение администратора или модератора");
    }

    return this.prisma.$transaction(async (prisma) => {
      const deleted = await prisma.message.update({ where: { id: message.id }, data: { deletedAt: new Date() } });
      await prisma.moderationAudit.create({
        data: {
          actorId: actor.id,
          action: "MESSAGE_DELETE",
          targetUserId: message.authorId,
          messageId: message.id,
          reportId,
          details: { roomId: message.roomId },
        },
      });
      return deleted;
    });
  }

  private requireModerator(actor: AuthenticatedUser) {
    if (actor.role === "user") throw new ForbiddenException("Недостаточно полномочий");
  }

  private requireAdmin(actor: AuthenticatedUser) {
    if (actor.role !== "admin") throw new ForbiddenException("Требуются права администратора");
  }

  private async assertTarget(actor: AuthenticatedUser, userId: string) {
    this.requireModerator(actor);
    if (actor.id === userId) throw new BadRequestException("Нельзя применить действие к себе");
    const target = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!target) throw new NotFoundException("Пользователь не найден");
    return target;
  }
}
