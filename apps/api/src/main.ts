import { ConsoleLogger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { AppModule } from "./app.module";
import { MetricsService } from "./observability/metrics.service";

async function bootstrap() {
  const production = process.env.NODE_ENV === "production";
  const logger = new ConsoleLogger({ json: production, colors: !production, compact: true });
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger });
  const metrics = app.get(MetricsService);
  app.disable("x-powered-by");
  app.enableShutdownHooks();

  if (production) app.set("trust proxy", 1);
  app.use((request: Request, response: Response, next: NextFunction) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

    const suppliedId = request.headers["x-request-id"];
    const requestId = typeof suppliedId === "string" && /^[A-Za-z0-9._-]{1,100}$/.test(suppliedId)
      ? suppliedId
      : randomUUID();
    response.setHeader("X-Request-Id", requestId);
    const startedAt = process.hrtime.bigint();

    response.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      metrics.recordHttp(request.method, response.statusCode, durationMs);
      if (request.path !== "/api/health/live") {
        logger.log({
          event: "http_request",
          requestId,
          method: request.method,
          path: request.originalUrl.split("?")[0],
          statusCode: response.statusCode,
          durationMs: Number(durationMs.toFixed(3)),
        }, "HTTP");
      }
    });
    next();
  });

  app.useStaticAssets(join(process.cwd(), "uploads"), { prefix: "/uploads/" });
  app.useStaticAssets(join(process.cwd(), "assets", "bot-avatars"), { prefix: "/bot-avatars/" });
  app.setGlobalPrefix("api");
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:3000", credentials: true });
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
  logger.log({ event: "api_started", port }, "Bootstrap");
}
void bootstrap();
