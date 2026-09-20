import { Module } from "@nestjs/common";
import { AuthController, MeController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { SessionGuard } from "./session.guard";
import { ProfileService } from "./profile.service";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [AuthController, MeController],
  providers: [AuthService, SessionGuard, ProfileService],
  exports: [AuthService, SessionGuard, ProfileService],
})
export class AuthModule {}
