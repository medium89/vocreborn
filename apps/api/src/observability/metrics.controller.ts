import { Controller, Get, Header, Req, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { MetricsService } from "./metrics.service";

@Controller("metrics")
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  getMetrics(@Req() request: Request) {
    const requiredToken = process.env.METRICS_TOKEN;
    if (requiredToken && request.headers.authorization !== "Bearer " + requiredToken) {
      throw new UnauthorizedException("Требуется токен метрик");
    }
    return this.metrics.render();
  }
}
