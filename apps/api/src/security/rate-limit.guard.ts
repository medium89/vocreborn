import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import { SESSION_COOKIE } from "../auth/auth.types";
import { RATE_LIMIT_METADATA, type RateLimitOptions } from "./rate-limit.decorator";
import { RateLimitService, type RateLimitResult } from "./rate-limit.service";

type RequestWithCookies = Request & { cookies?: Record<string, string | undefined> };

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limits: RateLimitService,
  ) {}

  canActivate(context: ExecutionContext) {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options || context.getType() !== "http") return true;

    const request = context.switchToHttp().getRequest<RequestWithCookies>();
    const response = context.switchToHttp().getResponse<Response>();
    const namespace = context.getClass().name + ":" + context.getHandler().name;
    const ip = request.ip || request.socket.remoteAddress || "unknown";
    const checks = this.keys(namespace, options, request, ip);
    let strictest: RateLimitResult | undefined;

    for (const check of checks) {
      const result = this.limits.consume(check.key, check.limit, options.windowMs);
      if (!strictest || result.remaining < strictest.remaining) strictest = result;
      if (!result.allowed) {
        const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
        response.setHeader("Retry-After", String(retryAfter));
        response.setHeader("X-RateLimit-Limit", String(check.limit));
        response.setHeader("X-RateLimit-Remaining", "0");
        response.setHeader("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
        throw new HttpException(
          { statusCode: HttpStatus.TOO_MANY_REQUESTS, message: "Слишком много запросов. Повторите позже." },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    if (strictest) {
      response.setHeader("X-RateLimit-Limit", String(options.limit));
      response.setHeader("X-RateLimit-Remaining", String(strictest.remaining));
      response.setHeader("X-RateLimit-Reset", String(Math.ceil(strictest.resetAt / 1000)));
    }
    return true;
  }

  private keys(namespace: string, options: RateLimitOptions, request: RequestWithCookies, ip: string) {
    if (options.key === "ip") return [{ key: namespace + ":ip:" + ip, limit: options.limit }];

    if (options.key === "ip-and-username") {
      const rawUsername = typeof request.body?.username === "string" ? request.body.username : "unknown";
      const username = rawUsername.normalize("NFKC").trim().toLowerCase().slice(0, 80);
      return [
        { key: namespace + ":account:" + username, limit: options.limit },
        { key: namespace + ":ip:" + ip, limit: options.limit * 5 },
      ];
    }

    const token = request.cookies?.[SESSION_COOKIE];
    const identity = token ? createHash("sha256").update(token).digest("hex") : "anonymous";
    return [
      { key: namespace + ":session:" + identity, limit: options.limit },
      { key: namespace + ":ip:" + ip, limit: options.limit * 5 },
    ];
  }
}
