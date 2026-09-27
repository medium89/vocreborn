import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseInterceptors, UseGuards } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { AuthenticatedUser } from "../auth/auth.types";
import { RateLimit } from "../security/rate-limit.decorator";
import { CommunitiesService } from "./communities.service";
import { CreateCommunityDto, CreateCommunityMessageDto, CreateCommunityPostDto, CreateCommunityTopicDto, MembershipRoleDto, RequestDecisionDto, UpdateCommunityDto } from "./community.dto";

@Controller("communities")
@UseGuards(SessionGuard)
export class CommunitiesController {
  constructor(private readonly communities: CommunitiesService) {}
  @Get("menu-badge") menuBadge(@CurrentUser() user: AuthenticatedUser) { return this.communities.menuBadge(user); }

  @Get() list(@CurrentUser() user: AuthenticatedUser) { return this.communities.list(user.id); }
  @Post() @RateLimit({ limit: 5, windowMs: 60 * 60 * 1000, key: "session" }) create(@Body() input: CreateCommunityDto, @CurrentUser() user: AuthenticatedUser) { return this.communities.create(user, input); }
  @Post(":id/cover")
  @UseInterceptors(FileInterceptor("cover", { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000, key: "session" })
  uploadCover(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @CurrentUser() user: AuthenticatedUser, @UploadedFile() file?: { buffer: Buffer; mimetype: string; size: number }) {
    return this.communities.uploadCover(id, user, file);
  }
  @Get(":id") detail(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @CurrentUser() user: AuthenticatedUser) { return this.communities.detail(id, user.id); }
  @Patch(":id") update(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @Body() input: UpdateCommunityDto, @CurrentUser() user: AuthenticatedUser) { return this.communities.update(id, user, input); }
  @Post(":id/join") @RateLimit({ limit: 20, windowMs: 60 * 1000, key: "session" }) join(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @CurrentUser() user: AuthenticatedUser) { return this.communities.join(id, user); }
  @Delete(":id/members/me") leave(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @CurrentUser() user: AuthenticatedUser) { return this.communities.leave(id, user); }
  @Get(":id/requests") requests(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @CurrentUser() user: AuthenticatedUser) { return this.communities.requests(id, user); }
  @Patch(":id/requests/:userId") decide(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @Param("userId", new ParseUUIDPipe({ version: "4" })) userId: string, @Body() input: RequestDecisionDto, @CurrentUser() user: AuthenticatedUser) { return this.communities.decideRequest(id, userId, user, input.decision); }
  @Patch(":id/members/:userId") role(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @Param("userId", new ParseUUIDPipe({ version: "4" })) userId: string, @Body() input: MembershipRoleDto, @CurrentUser() user: AuthenticatedUser) { return this.communities.setRole(id, userId, user, input.role); }
  @Get(":id/topics") topics(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @CurrentUser() user: AuthenticatedUser) { return this.communities.listTopics(id, user); }
  @Post(":id/topics") @RateLimit({ limit: 10, windowMs: 60 * 1000, key: "session" }) createTopic(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @Body() input: CreateCommunityTopicDto, @CurrentUser() user: AuthenticatedUser) { return this.communities.createTopic(id, user, input.name); }
  @Get(":id/chat") chat(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @Query("topicId") topicId: string | undefined, @CurrentUser() user: AuthenticatedUser) { return this.communities.listChatMessages(id, user, topicId); }
  @Get(":id/chat/page") chatPage(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @Query("topicId") topicId: string | undefined, @Query("cursor", new ParseUUIDPipe({ version: "4", optional: true })) cursor: string | undefined, @CurrentUser() user: AuthenticatedUser) { return this.communities.listChatMessagePage(id, user, topicId, cursor); }
  @Post(":id/chat") @RateLimit({ limit: 40, windowMs: 60 * 1000, key: "session" }) sendChat(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @Body() input: CreateCommunityMessageDto, @CurrentUser() user: AuthenticatedUser) { return this.communities.createChatMessage(id, user, input.body ?? "", input.topicId, input.attachmentId); }
  @Post(":id/posts") @RateLimit({ limit: 20, windowMs: 60 * 1000, key: "session" }) post(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @Body() input: CreateCommunityPostDto, @CurrentUser() user: AuthenticatedUser) { return this.communities.createPost(id, user, input.body); }
  @Delete(":id/posts/:postId") removePost(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @Param("postId", new ParseUUIDPipe({ version: "4" })) postId: string, @CurrentUser() user: AuthenticatedUser) { return this.communities.deletePost(id, postId, user); }
}
