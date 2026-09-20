import { Module } from "@nestjs/common";
import { AdminModule } from "./admin/admin.module";
import { BotsModule } from "./bots/bots.module";
import { AttachmentsModule } from "./attachments/attachments.module";
import { AuthModule } from "./auth/auth.module";
import { ChatModule } from "./chat/chat.module";
import { CommunitiesModule } from "./communities/communities.module";
import { DatabaseModule } from "./database/database.module";
import { HealthController } from "./health.controller";
import { GiftsModule } from "./gifts/gifts.module";
import { ObservabilityModule } from "./observability/observability.module";
import { ProfilePostsModule } from "./profile-posts/profile-posts.module";
import { ReportsModule } from "./reports/reports.module";
import { SecurityModule } from "./security/security.module";

@Module({
  imports: [DatabaseModule, ObservabilityModule, SecurityModule, AuthModule, AttachmentsModule, ChatModule, BotsModule, CommunitiesModule, GiftsModule, ProfilePostsModule, ReportsModule, AdminModule],
  controllers: [HealthController],
})
export class AppModule {}
