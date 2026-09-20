import { Module } from "@nestjs/common";
import { ChatModule } from "../chat/chat.module";
import { BotsService } from "./bots.service";

@Module({
  imports: [ChatModule],
  providers: [BotsService],
})
export class BotsModule {}
