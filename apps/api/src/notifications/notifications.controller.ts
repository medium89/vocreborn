import { Controller, Get, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { AuthenticatedUser } from "../auth/auth.types";
import { RateLimit } from "../security/rate-limit.decorator";
import { NotificationsService } from "./notifications.service";
@Controller("notifications")
@UseGuards(SessionGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}
  @Get()
  list(@CurrentUser() user: AuthenticatedUser) { return this.notifications.list(user.id); }
  @Post("read")
  @RateLimit({ limit: 120, windowMs: 60 * 1000, key: "session" })
  markAllRead(@CurrentUser() user: AuthenticatedUser) { return this.notifications.markAllRead(user.id); }
}
