import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentUser } from "../auth/current-user.decorator";
import { ProfileService } from "../auth/profile.service";
import { SessionGuard } from "../auth/session.guard";
import type { AuthenticatedUser } from "../auth/auth.types";
import { RateLimit } from "../security/rate-limit.decorator";
import { ChatService } from "./chat.service";
import { ChatGateway } from "./chat.gateway";
import { ToggleReactionDto } from "./dto/reaction.dto";
import { MessagePageQueryDto } from "./dto/pagination.dto";
import { SearchMessagesQueryDto } from "./dto/search-messages.dto";
import { CreateRoomDto, UpdateRoomDto } from "./dto/room.dto";
import { CreateDirectMessageDto, CreateRoomMessageDto } from "./dto/send-message.dto";

@Controller("rooms")
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  listRooms() {
    return this.chat.listRooms();
  }

  @Post()
  @UseGuards(SessionGuard)
  @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000, key: "session" })
  createRoom(@Body() input: CreateRoomDto, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.createRoom(user.id, input);
  }

  @Patch(":roomId")
  @UseGuards(SessionGuard)
  @RateLimit({ limit: 30, windowMs: 60 * 1000, key: "session" })
  updateRoom(@Param("roomId") roomId: string, @Body() input: UpdateRoomDto, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.updateRoom(roomId, user.id, user.role, input);
  }

  @Post(":roomId/cover")
  @UseGuards(SessionGuard)
  @UseInterceptors(FileInterceptor("cover", { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000, key: "session" })
  uploadCover(@Param("roomId") roomId: string, @UploadedFile() file: { buffer: Buffer; mimetype: string; size: number } | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.saveRoomCover(roomId, user.id, user.role, file);
  }

  @Post(":roomId/join")
  @UseGuards(SessionGuard)
  @RateLimit({ limit: 60, windowMs: 60 * 1000, key: "session" })
  joinRoom(@Param("roomId") roomId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.joinMembership(user.id, roomId);
  }

  @Delete(":roomId/members/me")
  @UseGuards(SessionGuard)
  @RateLimit({ limit: 60, windowMs: 60 * 1000, key: "session" })
  leaveRoom(@Param("roomId") roomId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.leaveMembership(user.id, roomId);
  }

  @Get(":roomId/resources")
  @UseGuards(SessionGuard)
  getResources(@Param("roomId") roomId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.getRoomResources(roomId, user.id);
  }

  @Get(":roomId/messages")
  @UseGuards(SessionGuard)
  getMessages(@Param("roomId") roomId: string, @Query() query: MessagePageQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.getMessagePage(roomId, query.cursor, user.id);
  }

  @Get(":roomId/search")
  @UseGuards(SessionGuard)
  searchMessages(@Param("roomId") roomId: string, @Query() query: SearchMessagesQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.searchRoomMessages(roomId, query.q, user.id);
  }

  @Get(":roomId/messages/:messageId")
  @UseGuards(SessionGuard)
  getMessage(
    @Param("roomId") roomId: string,
    @Param("messageId", new ParseUUIDPipe({ version: "4" })) messageId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chat.getRoomMessage(roomId, messageId, user.id);
  }

  @Post(":roomId/messages")
  @UseGuards(SessionGuard)
  @RateLimit({ limit: 60, windowMs: 10 * 1000, key: "session" })
  async createMessage(
    @Param("roomId") roomId: string,
    @Body() input: CreateRoomMessageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      requestId: input.requestId,
      message: await this.chat.createMessage(roomId, input.body ?? "", input.requestId, user.id, user.displayName, input.attachmentId, input.replyToId),
    };
  }
}

@Controller("users")
@UseGuards(SessionGuard)
export class UsersController {
  constructor(private readonly chat: ChatService, private readonly profiles: ProfileService) {}

  @Get()
  listUsers(@CurrentUser() user: AuthenticatedUser) {
    return this.chat.listUsers(user.id);
  }

  @Get(":userId")
  getProfile(@Param("userId", new ParseUUIDPipe({ version: "4" })) userId: string) {
    return this.profiles.getPublicProfile(userId);
  }
}

@Controller("direct")
@UseGuards(SessionGuard)
export class DirectController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  listConversations(@CurrentUser() user: AuthenticatedUser) {
    return this.chat.listDirectConversations(user.id);
  }

  @Get("resources")
  getResources(@CurrentUser() user: AuthenticatedUser) {
    return this.chat.getDirectResources(user.id);
  }

  @Post(":peerId/read")
  @RateLimit({ limit: 120, windowMs: 60 * 1000, key: "session" })
  markRead(@Param("peerId", new ParseUUIDPipe({ version: "4" })) peerId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.markDirectRead(user.id, peerId);
  }

  @Get(":peerId/messages")
  getMessages(
    @Param("peerId", new ParseUUIDPipe({ version: "4" })) peerId: string,
    @Query() query: MessagePageQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chat.getDirectMessagePage(user.id, peerId, query.cursor);
  }

  @Get(":peerId/search")
  searchMessages(
    @Param("peerId", new ParseUUIDPipe({ version: "4" })) peerId: string,
    @Query() query: SearchMessagesQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chat.searchDirectMessages(user.id, peerId, query.q);
  }

  @Post(":peerId/messages")
  @RateLimit({ limit: 60, windowMs: 10 * 1000, key: "session" })
  async createMessage(
    @Param("peerId", new ParseUUIDPipe({ version: "4" })) peerId: string,
    @Body() input: CreateDirectMessageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      requestId: input.requestId,
      message: await this.chat.createDirectMessage(peerId, input.body ?? "", input.requestId, user.id, user.displayName, input.attachmentId, input.replyToId),
    };
  }
}

@Controller("messages")
@UseGuards(SessionGuard)
export class ReactionsController {
  constructor(private readonly chat: ChatService, private readonly gateway: ChatGateway) {}

  @Put(":messageId/reaction")
  @RateLimit({ limit: 120, windowMs: 60 * 1000, key: "session" })
  async toggle(
    @Param("messageId", new ParseUUIDPipe({ version: "4" })) messageId: string,
    @Body() input: ToggleReactionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const update = await this.chat.toggleReaction(user.id, messageId, input.type);
    this.gateway.notifyReaction(update);
    return update;
  }
}