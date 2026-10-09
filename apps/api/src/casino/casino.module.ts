import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CasinoController } from "./casino.controller";
import { CasinoService } from "./casino.service";

@Module({ imports: [AuthModule], controllers: [CasinoController], providers: [CasinoService] })
export class CasinoModule {}
