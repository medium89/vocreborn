import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Gender, UserRole } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsIn, IsInt, IsString, ValidateIf, Length, Matches, Max, MaxLength, Min } from "class-validator";
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

  @ValidateIf((_object, value) => value !== undefined) @IsInt() @Min(0) @Max(2147483647)
  rating?: number;

  @ValidateIf((_object, value) => value !== undefined) @IsInt() @Min(0) @Max(2147483647)
  credits?: number;
}

@Controller("admin")
@UseGuards(SessionGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

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
