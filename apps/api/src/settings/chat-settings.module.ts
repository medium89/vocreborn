import { Global, Module } from "@nestjs/common";
import { ChatSettingsService } from "./chat-settings.service";
@Global()
@Module({ providers: [ChatSettingsService], exports: [ChatSettingsService] })
export class ChatSettingsModule {}
