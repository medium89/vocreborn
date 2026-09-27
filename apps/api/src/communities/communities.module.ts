import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AttachmentsModule } from "../attachments/attachments.module";
import { CommunitiesController } from "./communities.controller";
import { CommunitiesService } from "./communities.service";

@Module({ imports: [AuthModule, AttachmentsModule], controllers: [CommunitiesController], providers: [CommunitiesService] })
export class CommunitiesModule {}
