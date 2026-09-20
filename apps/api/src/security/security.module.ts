import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { RateLimitGuard } from "./rate-limit.guard";
import { RateLimitService } from "./rate-limit.service";
import { SessionRevocationService } from "./session-revocation.service";

@Global()
@Module({
  providers: [
    RateLimitService,
    SessionRevocationService,
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
  exports: [RateLimitService, SessionRevocationService],
})
export class SecurityModule {}
