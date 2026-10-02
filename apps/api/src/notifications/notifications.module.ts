import { forwardRef, Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { PushService } from "./push.service";

@Module({
  imports: [DatabaseModule, forwardRef(() => AuthModule)],
  controllers: [NotificationsController],
  providers: [NotificationsService, PushService],
  exports: [NotificationsService, PushService],
})
export class NotificationsModule {}