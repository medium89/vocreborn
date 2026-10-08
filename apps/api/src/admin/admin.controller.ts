import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Gender, UserRole } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsString, IsObject, IsUUID, ValidateIf, Length, Matches, Max, MaxLength, Min } from "class-validator";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { AuthenticatedUser } from "../auth/auth.types";
import { RateLimit } from "../security/rate-limit.decorator";
import { AdminService } from "./admin.service";

class SetRoleDto {
  @IsIn(["USER", "MODERATOR", "ADMIN"])
  role!: UserRole;
}
class UpdateUserDto {
  @ValidateIf((_object, value) => value !== undefined) @Transform(({ value }) => typeof value === "string" ? value.trim().toLowerCase() : value)
  @IsString() @Matches(/^[a-z0-9_]{3,32}$/, { message: "Логин: 3–32 символа, латиница, цифры и подчёркивание" })
  username?: string;

  @ValidateIf((_object, value) => value !== undefined) @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString() @Length(2, 64)
  displayName?: string;

  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(500)
  bio?: string;

  @ValidateIf((_object, value) => value !== undefined) @IsIn(["MALE", "FEMALE", "UNSPECIFIED"])
  gender?: Gender;

  @ValidateIf((_object, value) => value !== undefined) @IsIn(["USER", "MODERATOR", "ADMIN"])
  role?: UserRole;

  @ValidateIf((_object, value) => value !== undefined) @IsBoolean()
  hideRole?: boolean;

  @ValidateIf((_object, value) => value !== undefined) @IsBoolean()
  hideDj?: boolean;

  @ValidateIf((_object, value) => value !== undefined) @Transform(({ value }) => typeof value === "string" ? value.trim() || "member" : value)
  @IsString() @MaxLength(48)
  participantBadge?: string;

  @ValidateIf((_object, value) => value !== undefined) @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString() @MaxLength(16)
  participantBadgeIcon?: string;

  @ValidateIf((_object, value) => value !== undefined) @IsInt() @Min(0) @Max(2147483647)
  rating?: number;

  @ValidateIf((_object, value) => value !== undefined) @IsInt() @Min(0) @Max(2147483647)
  credits?: number;
}

class CosmeticDto {
  @IsString() effectKey!: string;
  @IsIn(["grant", "revoke"]) action!: "grant" | "revoke";
  @IsString() @Length(2, 500) reason!: string;
}
class SettingsDto {
  @IsObject() settings!: Record<string, unknown>;
  @IsInt() @Min(0) version!: number;
  @IsString() @Length(1, 500) reason!: string;
}
class AnnouncementDto {
  @IsString() @Length(1, 1000) body!: string;
  @IsUUID("4") requestId!: string;
}
class CreditAdjustmentDto {
  @IsIn(["add", "remove", "set"]) mode!: "add" | "remove" | "set";
  @IsInt() @Min(0) @Max(2147483647) amount!: number;
  @IsString() @Length(2, 500) reason!: string;
  @IsUUID("4") requestId!: string;
}
@Controller("admin")
@UseGuards(SessionGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("settings")
  settings(@CurrentUser() actor: AuthenticatedUser) { return this.admin.settings(actor); }

  @Patch("settings")
  saveSettings(@CurrentUser() actor: AuthenticatedUser, @Body() input: SettingsDto) { return this.admin.saveSettings(actor, input); }

  @Get("system")
  system(@CurrentUser() actor: AuthenticatedUser) { return this.admin.system(actor); }

  @Get("content")
  content(@CurrentUser() actor: AuthenticatedUser, @Query("q") query?: string) { return this.admin.content(actor, query); }

  @Post("announcements")
  @RateLimit({ limit: 10, windowMs: 60000, key: "session" })
  announce(@CurrentUser() actor: AuthenticatedUser, @Body() input: AnnouncementDto) { return this.admin.announce(actor, input); }

  @Get("economy")
  economy(@CurrentUser() actor: AuthenticatedUser, @Query("userId") userId?: string, @Query("cursor") cursor?: string) { return this.admin.economy(actor, userId, cursor); }

  @Post("users/:id/credits")
  adjustCredits(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @CurrentUser() actor: AuthenticatedUser, @Body() input: CreditAdjustmentDto) { return this.admin.adjustCredits(actor, id, input); }

  @Post("users/:id/cosmetics")
  cosmetics(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @CurrentUser() actor: AuthenticatedUser, @Body() input: CosmeticDto) { return this.admin.cosmetics(actor, id, input); }

  @Post("users/:id/sessions/revoke")
  revokeSessions(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @CurrentUser() actor: AuthenticatedUser) { return this.admin.revokeSessions(actor, id); }

  @Get("overview")
  overview(@CurrentUser() actor: AuthenticatedUser) { return this.admin.overview(actor); }

  @Get("users")
  users(@CurrentUser() actor: AuthenticatedUser, @Query("q") query?: string) { return this.admin.users(actor, query); }

  @Get("users/:id")
  user(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.admin.userDetail(actor, id);
  }

  @Patch("users/:id")
  updateUser(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() input: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) { return this.admin.updateUser(actor, id, input); }

  @Post("users/:id/avatar")
  @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000, key: "session" })
  @UseInterceptors(FileInterceptor("avatar", { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  uploadUserAvatar(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @UploadedFile() file: { buffer: Buffer; mimetype: string; size: number } | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) { return this.admin.uploadUserAvatar(actor, id, file); }

  @Delete("users/:id/avatar")
  removeUserAvatar(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.admin.removeUserAvatar(actor, id);
  }

  @Patch("users/:id/role")
  setRole(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() input: SetRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) { return this.admin.setRole(actor, id, input.role); }

  @Delete("users/:id")
  deactivate(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.admin.deactivate(actor, id);
  }
}
