import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { PrismaService } from "./database/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  getHealth() {
    return this.liveness();
  }

  @Get("live")
  liveness() {
    return {
      status: "ok",
      service: "vocreborn-api",
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Get("ready")
  async readiness() {
    const components = { database: "unknown", uploads: "unknown", attachments: "unknown" };
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      components.database = "ok";
      await access(join(process.cwd(), "uploads"), constants.W_OK);
      components.uploads = "ok";
      await access(join(process.cwd(), "storage", "attachments"), constants.W_OK);
      components.attachments = "ok";
      return { status: "ok", service: "vocreborn-api", components, timestamp: new Date().toISOString() };
    } catch {
      throw new ServiceUnavailableException({
        status: "error",
        service: "vocreborn-api",
        components,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
