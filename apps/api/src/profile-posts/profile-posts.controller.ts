import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { AuthenticatedUser } from "../auth/auth.types";
import { RateLimit } from "../security/rate-limit.decorator";
import { CreateProfilePostDto } from "./profile-posts.dto";
import { ProfilePostsService } from "./profile-posts.service";

@Controller()
@UseGuards(SessionGuard)
export class ProfilePostsController {
  constructor(private readonly posts: ProfilePostsService) {}

  @Get("users/:userId/profile-posts")
  list(@Param("userId", new ParseUUIDPipe({ version: "4" })) userId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.posts.list(userId, actor.id);
  }

  @Post("users/:userId/profile-posts")
  @RateLimit({ limit: 20, windowMs: 60 * 1000, key: "session" })
  create(
    @Param("userId", new ParseUUIDPipe({ version: "4" })) userId: string,
    @Body() input: CreateProfilePostDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.posts.create(userId, actor, input.body, input.parentId, input.attachmentId);
  }

  @Post("profile-posts/:id/like")
  @RateLimit({ limit: 60, windowMs: 60 * 1000, key: "session" })
  like(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.posts.toggleLike(id, actor);
  }

  @Delete("profile-posts/:id")
  remove(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.posts.remove(id, actor);
  }
}
