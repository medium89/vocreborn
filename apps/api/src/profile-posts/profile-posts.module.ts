import { Module } from "@nestjs/common";
import { AttachmentsModule } from "../attachments/attachments.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AuthModule } from "../auth/auth.module";
import { GiftsModule } from "../gifts/gifts.module";
import { ProfilePostsController } from "./profile-posts.controller";
import { ProfilePostsService } from "./profile-posts.service";

@Module({
  imports: [AuthModule, AttachmentsModule, NotificationsModule, GiftsModule],
  controllers: [ProfilePostsController],
  providers: [ProfilePostsService],
})
export class ProfilePostsModule {}
