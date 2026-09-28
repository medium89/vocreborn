import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RadioController } from "./radio.controller";
import { RadioService } from "./radio.service";
@Module({ imports: [AuthModule], controllers: [RadioController], providers: [RadioService], exports: [RadioService] })
export class RadioModule {}
