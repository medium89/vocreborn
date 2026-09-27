import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { AuthenticatedUser } from "../auth/auth.types";
import { RateLimit } from "../security/rate-limit.decorator";
import { SendGiftDto } from "./gift.dto";
import { GiftsService } from "./gifts.service";
import { StoreEditorService } from "./store-editor.service";

@Controller("gifts")
@UseGuards(SessionGuard)
export class GiftsController {
  @Get("balance") balance(@CurrentUser() user: AuthenticatedUser) { return this.gifts.balance(user.id); }
  constructor(private readonly gifts: GiftsService, private readonly store: StoreEditorService) {}
  @Get("categories") categories() { return this.store.publicCategories(); }
  @Get() catalog() { return this.gifts.catalog(); }
  @Get("me") inventory(@CurrentUser() user: AuthenticatedUser) { return this.gifts.inventory(user.id); }
  @Get("cosmetics/me") cosmetics(@CurrentUser() user: AuthenticatedUser) { return this.gifts.myCosmetics(user.id); }
  @Post(":giftId/buy") @RateLimit({ limit: 12, windowMs: 60 * 1000, key: "session" }) buy(@Param("giftId") giftId: string, @CurrentUser() user: AuthenticatedUser) { return this.gifts.buyCosmetic(giftId, user.id); }
  @Patch("cosmetics/:effectKey") @RateLimit({ limit: 30, windowMs: 60 * 1000, key: "session" }) configure(@Param("effectKey") key: string, @Body("settings") settings: unknown, @CurrentUser() user: AuthenticatedUser) { return this.gifts.updateCosmetic(user.id, key, settings); }
  @Post(":giftId/send") @RateLimit({ limit: 20, windowMs: 60 * 1000, key: "session" }) send(@Param("giftId") giftId: string, @Body() input: SendGiftDto, @CurrentUser() user: AuthenticatedUser) { return this.gifts.send(giftId, user, input.recipientId, input.message); }
}
