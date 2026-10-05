import { Module } from "@nestjs/common";
import { AttachmentsModule } from "../attachments/attachments.module";
import { AuthModule } from "../auth/auth.module";
import { ChatController, DirectController, ReactionsController, UsersController } from "./chat.controller";
import { ChatGateway } from "./chat.gateway";
import { ChatService } from "./chat.service";
import { ModerationController } from "../moderation/moderation.controller";
import { ModerationService } from "../moderation/moderation.service";
import { JevModerationService } from "../moderation/jev-moderation.service";
import { GiftsModule } from "../gifts/gifts.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [AuthModule, AttachmentsModule, NotificationsModule, GiftsModule],
  exports: [ChatGateway, ChatService, ModerationService],
  controllers: [ChatController, UsersController, DirectController, ReactionsController, ModerationController],
  providers: [ChatService, ChatGateway, ModerationService, JevModerationService],
})
export class ChatModule {}
