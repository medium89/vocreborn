import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ReportStatus } from "@prisma/client";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../database/prisma.service";
import { ChatGateway } from "../chat/chat.gateway";
import { ModerationService } from "../moderation/moderation.service";
import { ActOnReportDto, ReportActionKind } from "./report.dto";
import type { CreateReportDto, ReviewReportDto } from "./report.dto";

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService, private readonly moderation: ModerationService, private readonly gateway: ChatGateway) {}

  async create(reporter: AuthenticatedUser, input: CreateReportDto) {
    if (Boolean(input.userId) === Boolean(input.messageId)) {
      throw new BadRequestException("Укажите ровно одну цель жалобы: пользователя или сообщение");
    }

    if (input.userId) {
      if (input.userId === reporter.id) throw new BadRequestException("Нельзя пожаловаться на себя");
      const target = await this.prisma.user.findFirst({ where: { id: input.userId, deletedAt: null } });
      if (!target) throw new NotFoundException("Пользователь не найден");
    }

    if (input.messageId) {
      const message = await this.prisma.message.findFirst({ where: { id: input.messageId, deletedAt: null } });
      if (!message) throw new NotFoundException("Сообщение не найдено");
      if (message.authorId === reporter.id) throw new BadRequestException("Нельзя пожаловаться на своё сообщение");
    }

    const duplicate = await this.prisma.report.findFirst({
      where: {
        reporterId: reporter.id,
        status: { in: ["OPEN", "REVIEWED"] },
        ...(input.userId ? { targetUserId: input.userId } : { messageId: input.messageId }),
      },
    });
    if (duplicate) throw new ConflictException("Такая жалоба уже ожидает рассмотрения");

    return this.prisma.report.create({
      data: {
        reporterId: reporter.id,
        targetUserId: input.userId,
        messageId: input.messageId,
        reason: input.reason,
        details: input.details || null,
      },
    });
  }

  async list(actor: AuthenticatedUser, status?: ReportStatus) {
    this.requireModerator(actor);
    const reports = await this.prisma.report.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        reporter: { select: { id: true, username: true, displayName: true } },
        targetUser: { select: { id: true, username: true, displayName: true, role: true } },
        message: { select: { id: true, authorId: true, authorName: true, body: true, roomId: true, createdAt: true, author: { select: { role: true } } } },
        handledBy: { select: { id: true, username: true, displayName: true } },
      },
    });
    return reports.map((report) => {
      const targetId = report.targetUserId ?? report.message?.authorId;
      const targetRole = report.targetUser?.role ?? report.message?.author?.role;
      return { ...report, canRestrictTarget: Boolean(targetId && targetId !== actor.id && targetRole &&
        targetRole !== "ADMIN" && (actor.role === "admin" || targetRole === "USER")) };
    });
  }

  async review(actor: AuthenticatedUser, reportId: string, input: ReviewReportDto) {
    this.requireModerator(actor);
    if (input.status === "OPEN") throw new BadRequestException("Нельзя вернуть жалобу в исходный статус");
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException("Жалоба не найдена");
    if (report.status === "DISMISSED" || report.status === "ACTIONED") {
      throw new ConflictException("Жалоба уже закрыта");
    }
    if (input.status === "ACTIONED") {
      const measure = await this.prisma.moderationAudit.findFirst({
        where: { reportId, action: { in: ["MUTE", "CHAOS", "BAN", "MESSAGE_DELETE"] } },
      });
      if (!measure) throw new BadRequestException("Сначала примените меру к сообщению или пользователю");
    }

    const terminal = input.status === "DISMISSED" || input.status === "ACTIONED";
    return this.prisma.$transaction(async (prisma) => {
      const updated = await prisma.report.update({
        where: { id: report.id },
        data: {
          status: input.status,
          handledById: actor.id,
          resolution: input.resolution || null,
          resolvedAt: terminal ? new Date() : null,
        },
      });
      await prisma.moderationAudit.create({
        data: {
          actorId: actor.id,
          action: "REPORT_" + input.status,
          targetUserId: report.targetUserId,
          messageId: report.messageId,
          reportId: report.id,
          details: { resolution: input.resolution || null },
        },
      });
      return updated;
    });
  }

  async action(actor: AuthenticatedUser, reportId: string, input: ActOnReportDto) {
    this.requireModerator(actor);
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: { message: { select: { id: true, authorId: true, roomId: true } } },
    });
    if (!report) throw new NotFoundException("Жалоба не найдена");
    if (report.status === "DISMISSED" || report.status === "ACTIONED") {
      throw new ConflictException("Жалоба уже закрыта");
    }

    // Повторный запрос после сбоя фиксации статуса не должен повторять наказание.
    const existingMeasure = await this.prisma.moderationAudit.findFirst({
      where: { reportId, action: { in: ["MUTE", "CHAOS", "BAN", "MESSAGE_DELETE"] } },
      orderBy: { createdAt: "desc" },
    });
    let measure = existingMeasure?.action;
    const targetUserId = report.targetUserId ?? report.message?.authorId;
    const reason = input.resolution || "Мера по жалобе: " + report.reason;

    if (!measure) {
      switch (input.action) {
        case ReportActionKind.DELETE_MESSAGE: {
          if (!report.messageId || !report.message?.roomId) {
            throw new BadRequestException("Можно удалить только сообщение из общего чата");
          }
          await this.moderation.deletePublicMessage(actor, report.messageId, reportId);
          this.gateway.notifyMessageDeleted(report.message.roomId, report.messageId);
          measure = "MESSAGE_DELETE";
          break;
        }
        case ReportActionKind.MUTE_HOUR:
        case ReportActionKind.MUTE_DAY: {
          if (!targetUserId) throw new BadRequestException("Автор сообщения не найден");
          const durationMinutes = input.action === ReportActionKind.MUTE_HOUR ? 60 : 1_440;
          const result = await this.moderation.mute(actor, { userId: targetUserId, durationMinutes, reason }, reportId);
          this.gateway.notifyModeration(result.userId, { mutedUntil: result.mutedUntil, banned: false, actorName: actor.displayName });
          measure = "MUTE";
          break;
        }
        case ReportActionKind.CHAOS_DAY: {
          if (!targetUserId) throw new BadRequestException("Автор сообщения не найден");
          const result = await this.moderation.imposeChaos(actor, { userId: targetUserId, durationMinutes: 1_440, reason }, reportId);
          this.gateway.notifyChaos(result.userId, result.chaosUntil, actor.displayName);
          measure = "CHAOS";
          break;
        }
        case ReportActionKind.BAN_DAY: {
          if (!targetUserId) throw new BadRequestException("Автор сообщения не найден");
          const result = await this.moderation.ban(actor, { userId: targetUserId, durationMinutes: 1_440, reason }, reportId);
          this.gateway.notifyModeration(result.userId, { mutedUntil: null, banned: true }, true);
          measure = "BAN";
          break;
        }
      }
    }

    const mutedMinutes = measure === "MUTE"
      ? existingMeasure
        ? Number((existingMeasure.details as { durationMinutes?: number } | null)?.durationMinutes)
        : input.action === ReportActionKind.MUTE_HOUR ? 60 : 1_440
      : null;
    const label = measure === "MESSAGE_DELETE"
      ? "Сообщение удалено"
      : measure === "BAN"
        ? "Аккаунт заблокирован на сутки"
        : measure === "CHAOS"
          ? "Хаос на сутки"
        : mutedMinutes === 60 ? "Пользователю запрещено писать на час" : "Пользователю запрещено писать на сутки";
    return this.review(actor, reportId, {
      status: "ACTIONED",
      resolution: input.resolution ? label + " · " + input.resolution : label,
    });
  }

  async audit(actor: AuthenticatedUser) {
    this.requireModerator(actor);
    return this.prisma.moderationAudit.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        actor: { select: { id: true, username: true, displayName: true } },
        targetUser: { select: { id: true, username: true, displayName: true } },
      },
    });
  }

  private requireModerator(actor: AuthenticatedUser) {
    if (actor.role === "user") throw new ForbiddenException("Недостаточно полномочий");
  }
}
