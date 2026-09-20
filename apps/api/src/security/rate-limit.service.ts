import { Injectable } from "@nestjs/common";

type Bucket = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

@Injectable()
export class RateLimitService {
  private readonly buckets = new Map<string, Bucket>();
  private operations = 0;

  consume(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
    this.operations += 1;
    if (this.operations % 1000 === 0 || this.buckets.size > 50_000) this.cleanup(now);

    const current = this.buckets.get(key);
    const bucket = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + windowMs }
      : current;

    if (bucket.count >= limit) {
      this.buckets.set(key, bucket);
      return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
    }

    bucket.count += 1;
    this.buckets.set(key, bucket);
    return { allowed: true, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.resetAt };
  }

  private cleanup(now: number) {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}
