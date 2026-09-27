import { forwardRef, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { EconomyService } from "./economy.service";
import { GiftsController } from "./gifts.controller";
import { GiftsService } from "./gifts.service";
import { StoreEditorController } from "./store-editor.controller";
import { StoreEditorService } from "./store-editor.service";
@Module({ imports: [forwardRef(() => AuthModule), NotificationsModule], controllers: [GiftsController, StoreEditorController], providers: [EconomyService, GiftsService, StoreEditorService], exports: [EconomyService] })
export class GiftsModule {}
