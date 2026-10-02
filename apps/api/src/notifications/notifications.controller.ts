import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { AuthenticatedUser } from "../auth/auth.types";
import { RateLimit } from "../security/rate-limit.decorator";
import { PushRemoveDto, PushSubscriptionDto } from "./dto/push.dto";
import { NotificationsService } from "./notifications.service";
import { PushService } from "./push.service";

@Controller("notifications")
@UseGuards(SessionGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService, private readonly push: PushService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser) { return this.notifications.list(user.id); }
  @Get("history") history(@CurrentUser() user: AuthenticatedUser, @Query("page") page?: string, @Query("types") types?: string) { return this.notifications.history(user.id, page, types); }
  @Get("push") pushSettings(@CurrentUser() user: AuthenticatedUser) { return this.push.settings(user.id); }
  @Get("push/config") pushConfig() { return this.push.config(); }
  @Post("push") @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000, key: "session" }) savePush(@CurrentUser() user: AuthenticatedUser, @Body() input: PushSubscriptionDto) { return this.push.saveSubscription(user.id, input, { direct: input.direct, mention: input.mention, adminPresence: input.adminPresence }); }
  @Delete("push") @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000, key: "session" }) removePush(@CurrentUser() user: AuthenticatedUser, @Body() input: PushRemoveDto) { return this.push.removeSubscription(user.id, input.endpoint); }
  @Delete("all") @RateLimit({ limit: 6, windowMs: 60 * 1000, key: "session" }) clearAll(@CurrentUser() user: AuthenticatedUser) { return this.notifications.clearAll(user.id); }
  @Delete(":id") @RateLimit({ limit: 120, windowMs: 60 * 1000, key: "session" }) remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) { return this.notifications.remove(user.id, id); }
  @Post("read") @RateLimit({ limit: 120, windowMs: 60 * 1000, key: "session" }) markAllRead(@CurrentUser() user: AuthenticatedUser) { return this.notifications.markAllRead(user.id); }
}