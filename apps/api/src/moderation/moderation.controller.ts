import { Body, Controller, Delete, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ChatGateway } from "../chat/chat.gateway";
import { BanUserDto, MuteUserDto } from "./moderation.dto";
import { ModerationService } from "./moderation.service";

@Controller()
@UseGuards(SessionGuard)
export class ModerationController {
  constructor(
    private readonly moderation: ModerationService,
    private readonly gateway: ChatGateway,
  ) {}

  @Post("moderation/mutes")
  async mute(@Body() input: MuteUserDto, @CurrentUser() actor: AuthenticatedUser) {
    const result = await this.moderation.mute(actor, input);
    this.gateway.notifyModeration(result.userId, { mutedUntil: result.mutedUntil, banned: false, actorName: actor.displayName });
    return result;
  }

  @Delete("moderation/mutes/:userId")
  async unmute(
    @Param("userId", new ParseUUIDPipe({ version: "4" })) userId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const result = await this.moderation.unmute(actor, userId);
    this.gateway.notifyModeration(result.userId, { mutedUntil: null, banned: false, actorName: actor.displayName });
    return result;
  }

  @Post("moderation/chaos")
  async imposeChaos(@Body() input: MuteUserDto, @CurrentUser() actor: AuthenticatedUser) {
    const result = await this.moderation.imposeChaos(actor, input);
    this.gateway.notifyChaos(result.userId, result.chaosUntil, actor.displayName);
    return result;
  }

  @Delete("moderation/chaos/:userId")
  async removeChaos(
    @Param("userId", new ParseUUIDPipe({ version: "4" })) userId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const result = await this.moderation.removeChaos(actor, userId);
    this.gateway.notifyChaos(result.userId, null, actor.displayName);
    return result;
  }

  @Post("moderation/bans")
  async ban(@Body() input: BanUserDto, @CurrentUser() actor: AuthenticatedUser) {
    const result = await this.moderation.ban(actor, input);
    this.gateway.notifyModeration(result.userId, { mutedUntil: null, banned: true }, true);
    return result;
  }

  @Delete("moderation/bans/:userId")
  async unban(
    @Param("userId", new ParseUUIDPipe({ version: "4" })) userId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.moderation.unban(actor, userId);
  }

  @Delete("messages/:messageId")
  async deleteMessage(
    @Param("messageId", new ParseUUIDPipe({ version: "4" })) messageId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const message = await this.moderation.deletePublicMessage(actor, messageId);
    this.gateway.notifyMessageDeleted(message.roomId as string, message.id);
    return { messageId: message.id };
  }
}
