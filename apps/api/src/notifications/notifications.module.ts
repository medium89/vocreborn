import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { PushService } from "./push.service";

@Module({
  imports: [DatabaseModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, PushService],
  exports: [NotificationsService, PushService],
})
export class NotificationsModule {}