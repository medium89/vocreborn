import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { EconomyService } from "./economy.service";
import { GiftsController } from "./gifts.controller";
import { GiftsService } from "./gifts.service";
@Module({ imports: [AuthModule, NotificationsModule], controllers: [GiftsController], providers: [EconomyService, GiftsService], exports: [EconomyService] })
export class GiftsModule {}
