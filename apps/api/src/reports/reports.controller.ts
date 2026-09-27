import { Body, Controller, Get, Param, ParseEnumPipe, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ReportStatus } from "@prisma/client";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { AuthenticatedUser } from "../auth/auth.types";
import { RateLimit } from "../security/rate-limit.decorator";
import { ActOnReportDto, CreateReportDto, ReviewReportDto } from "./report.dto";
import { ReportsService } from "./reports.service";

@Controller()
@UseGuards(SessionGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post("reports")
  @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000, key: "session" })
  create(@Body() input: CreateReportDto, @CurrentUser() user: AuthenticatedUser) {
    return this.reports.create(user, input);
  }

  @Get("moderation/reports")
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query("status", new ParseEnumPipe(ReportStatus, { optional: true })) status?: ReportStatus,
  ) {
    return this.reports.list(user, status);
  }

  @Patch("moderation/reports/:reportId")
  @RateLimit({ limit: 60, windowMs: 60 * 1000, key: "session" })
  review(
    @Param("reportId", new ParseUUIDPipe({ version: "4" })) reportId: string,
    @Body() input: ReviewReportDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.review(user, reportId, input);
  }

  @Post("moderation/reports/:reportId/actions")
  @RateLimit({ limit: 30, windowMs: 60 * 1000, key: "session" })
  action(
    @Param("reportId", new ParseUUIDPipe({ version: "4" })) reportId: string,
    @Body() input: ActOnReportDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.action(user, reportId, input);
  }

  @Get("moderation/audit")
  audit(@CurrentUser() user: AuthenticatedUser) {
    return this.reports.audit(user);
  }
}
