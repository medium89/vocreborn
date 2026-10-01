import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Transform } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from "class-validator";
import type { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { AuthenticatedUser } from "../auth/auth.types";
import { RateLimit } from "../security/rate-limit.decorator";
import { RadioService } from "./radio.service";

class OrderDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value) @IsString() @Length(1, 120) artist!: string;
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value) @IsString() @Length(1, 160) title!: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsOptional() @IsUUID("4") uploadId?: string;
  @IsUUID("4") idempotencyKey!: string;
  @IsInt() @Min(0) @Max(10000) expectedPrice!: number;
  @IsOptional() @IsBoolean() studio?: boolean;
}
class SettingsDto {
  @IsOptional() @IsBoolean() accepting?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(10000) price?: number;
}
class DjDto { @IsBoolean() enabled!: boolean; }
class StartDto { @IsOptional() @IsIn(["playlist", "butt"]) mode?: "playlist" | "butt"; }
class DecisionDto {
  @IsIn(["accept", "reject", "cancel", "attach"]) action!: "accept" | "reject" | "cancel" | "attach";
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
  @IsOptional() @IsUUID("4") uploadId?: string;
}
@Controller("radio")
@UseGuards(SessionGuard)
export class RadioController {
  constructor(private readonly radio: RadioService) {}
  @Get("status") status() { return this.radio.status(); }
  @Post("start") start(@CurrentUser() user: AuthenticatedUser, @Body() body?: StartDto) { return this.radio.start(user, body?.mode ?? "playlist"); }
  @Post("stop") stop(@CurrentUser() user: AuthenticatedUser) { return this.radio.stop(user); }
  @Post("skip") skip(@CurrentUser() user: AuthenticatedUser) { return this.radio.skip(user); }
  @Patch("settings") settings(@CurrentUser() user: AuthenticatedUser, @Body() body: SettingsDto) { return this.radio.settings(user, body); }
  @Patch("dj/:id") setDj(@CurrentUser() user: AuthenticatedUser, @Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @Body() body: DjDto) { return this.radio.setDj(user, id, body.enabled); }
  @Post("uploads")
  @RateLimit({ limit: 10, windowMs: 3600_000, key: "session" })
  @UseInterceptors(FileInterceptor("audio", { limits: { fileSize: 25 * 1024 * 1024, files: 1 } }))
  upload(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file: { buffer: Buffer; size: number; originalname: string; mimetype: string } | undefined) { return this.radio.upload(user, file); }
  @Get("uploads/:id")
  async file(@CurrentUser() user: AuthenticatedUser, @Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @Res() response: Response) {
    const file = await this.radio.file(user, id);
    response.setHeader("Cache-Control", "private, no-store"); response.type(file.mimeType); response.sendFile(file.path);
  }
  @Post("requests")
  @RateLimit({ limit: 10, windowMs: 60_000, key: "session" })
  order(@CurrentUser() user: AuthenticatedUser, @Body() body: OrderDto) { return this.radio.order(user, body); }
  @Get("requests/mine") mine(@CurrentUser() user: AuthenticatedUser) { return this.radio.mine(user); }
  @Get("requests/queue") queue() { return this.radio.queue(); }
  @Get("studio") studio(@CurrentUser() user: AuthenticatedUser) { return this.radio.studio(user); }
  @Patch("requests/:id") decide(@CurrentUser() user: AuthenticatedUser, @Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @Body() body: DecisionDto) { return this.radio.decide(user, id, body.action, body.reason ?? "", body.uploadId); }
}
