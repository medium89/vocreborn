import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../database/prisma.service";
import { CreateSupportTicketDto } from "./support.dto";
@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}
  create(actor: AuthenticatedUser, input: CreateSupportTicketDto) {
    return this.prisma.supportTicket.create({
      data: { userId: actor.id, subject: input.subject, message: input.message },
      select: { id: true, status: true, createdAt: true },
    });
  }
  list(actor: AuthenticatedUser) {
    this.requireAdmin(actor);
    return this.prisma.supportTicket.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 200,
      select: { id: true, subject: true, message: true, status: true, createdAt: true, resolvedAt: true,
        user: { select: { id: true, username: true, displayName: true, email: true } } },
    });
  }
  async review(actor: AuthenticatedUser, id: string, status: "OPEN" | "RESOLVED") {
    this.requireAdmin(actor);
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id }, select: { id: true } });
    if (!ticket) throw new NotFoundException("Обращение не найдено");
    return this.prisma.supportTicket.update({
      where: { id }, data: { status, resolvedAt: status === "RESOLVED" ? new Date() : null },
      select: { id: true, status: true, resolvedAt: true },
    });
  }
  private requireAdmin(actor: AuthenticatedUser) {
    if (actor.role !== "admin") throw new ForbiddenException("Доступно только администраторам");
  }
}
