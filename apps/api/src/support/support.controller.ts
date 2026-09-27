import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { AuthenticatedUser } from "../auth/auth.types";
import { RateLimit } from "../security/rate-limit.decorator";
import { CreateSupportTicketDto, ReviewSupportTicketDto } from "./support.dto";
import { SupportService } from "./support.service";
@Controller("support")
@UseGuards(SessionGuard)
export class SupportController {
  constructor(private readonly support: SupportService) {}
  @Post("tickets")
  @RateLimit({ limit: 5, windowMs: 60 * 60 * 1000, key: "session" })
  create(@Body() input: CreateSupportTicketDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.support.create(actor, input);
  }
  @Get("tickets")
  list(@CurrentUser() actor: AuthenticatedUser) { return this.support.list(actor); }
  @Patch("tickets/:id")
  @RateLimit({ limit: 60, windowMs: 60 * 1000, key: "session" })
  review(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() input: ReviewSupportTicketDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.support.review(actor, id, input.status);
  }
}
