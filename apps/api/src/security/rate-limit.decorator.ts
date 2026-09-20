import { SetMetadata } from "@nestjs/common";

export const RATE_LIMIT_METADATA = "voc:rate-limit";

export type RateLimitOptions = {
  limit: number;
  windowMs: number;
  key: "ip" | "session" | "ip-and-username";
};

export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_METADATA, options);
