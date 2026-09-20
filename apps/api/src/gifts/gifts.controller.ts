import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { AuthenticatedUser } from "../auth/auth.types";
import { RateLimit } from "../security/rate-limit.decorator";
import { SendGiftDto } from "./gift.dto";
import { GiftsService } from "./gifts.service";

@Controller("gifts")
@UseGuards(SessionGuard)
export class GiftsController {
  @Get("balance") balance(@CurrentUser() user: AuthenticatedUser) { return this.gifts.balance(user.id); }
  constructor(private readonly gifts: GiftsService) {}
  @Get() catalog() { return this.gifts.catalog(); }
  @Get("me") inventory(@CurrentUser() user: AuthenticatedUser) { return this.gifts.inventory(user.id); }
  @Post(":giftId/send") @RateLimit({ limit: 20, windowMs: 60 * 1000, key: "session" }) send(@Param("giftId") giftId: string, @Body() input: SendGiftDto, @CurrentUser() user: AuthenticatedUser) { return this.gifts.send(giftId, user, input.recipientId, input.message); }
}
