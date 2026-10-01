import { forwardRef, Module } from "@nestjs/common";
import { AuthController, MeController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { EmailService } from "./email.service";
import { SessionGuard } from "./session.guard";
import { ProfileService } from "./profile.service";
import { TurnstileService } from "./turnstile.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { GiftsModule } from "../gifts/gifts.module";

@Module({
  imports: [forwardRef(() => NotificationsModule), forwardRef(() => GiftsModule)],
  controllers: [AuthController, MeController],
  providers: [AuthService, EmailService, SessionGuard, ProfileService, TurnstileService],
  exports: [AuthService, SessionGuard, ProfileService],
})
export class AuthModule {}
