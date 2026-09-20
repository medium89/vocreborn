import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, UseGuards } from "@nestjs/common";
import { IsIn } from "class-validator";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { AuthenticatedUser } from "../auth/auth.types";
import { AdminService } from "./admin.service";

class SetRoleDto {
  @IsIn(["USER", "MODERATOR", "ADMIN"])
  role!: "USER" | "MODERATOR" | "ADMIN";
}

@Controller("admin")
@UseGuards(SessionGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("overview")
  overview(@CurrentUser() actor: AuthenticatedUser) {
    return this.admin.overview(actor);
  }

  @Get("users")
  users(@CurrentUser() actor: AuthenticatedUser) {
    return this.admin.users(actor);
  }

  @Patch("users/:id/role")
  setRole(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() input: SetRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.admin.setRole(actor, id, input.role);
  }

  @Delete("users/:id")
  deactivate(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.admin.deactivate(actor, id);
  }
}
