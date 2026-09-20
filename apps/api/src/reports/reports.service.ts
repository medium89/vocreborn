import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ReportStatus } from "@prisma/client";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../database/prisma.service";
import type { CreateReportDto, ReviewReportDto } from "./report.dto";

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

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
    return this.prisma.report.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        reporter: { select: { id: true, username: true, displayName: true } },
        targetUser: { select: { id: true, username: true, displayName: true } },
        message: { select: { id: true, authorName: true, body: true, roomId: true, createdAt: true } },
        handledBy: { select: { id: true, username: true, displayName: true } },
      },
    });
  }

  async review(actor: AuthenticatedUser, reportId: string, input: ReviewReportDto) {
    this.requireModerator(actor);
    if (input.status === "OPEN") throw new BadRequestException("Нельзя вернуть жалобу в исходный статус");
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException("Жалоба не найдена");

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
