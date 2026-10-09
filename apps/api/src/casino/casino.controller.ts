import { Body, Controller, Get, Post, UseGuards, ForbiddenException } from "@nestjs/common";
import { IsIn, IsInt, IsUUID, Min } from "class-validator";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { AuthenticatedUser } from "../auth/auth.types";
import { RateLimit } from "../security/rate-limit.decorator";
import { CasinoService, type CasinoColor } from "./casino.service";

class SpinDto {
  @IsUUID() requestId!: string;
  @IsIn(["red", "black", "green"]) choice!: CasinoColor;
  @IsInt() @Min(1) bet!: number;
}

@Controller("casino")
@UseGuards(SessionGuard)
export class CasinoController {
  constructor(private readonly casino: CasinoService) {}

  @Get()
  state(@CurrentUser() user: AuthenticatedUser) {
    if (user.isGuest) throw new ForbiddenException("Для игры нужна регистрация");
    return this.casino.state(user.id);
  }

  @Post("spin")
  @RateLimit({ limit: 20, windowMs: 60 * 1000, key: "session" })
  spin(@CurrentUser() user: AuthenticatedUser, @Body() input: SpinDto) {
    if (user.isGuest) throw new ForbiddenException("Для игры нужна регистрация");
    return this.casino.spin(user.id, input.requestId, input.choice, input.bet);
  }
}
