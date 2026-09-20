import { ReportReason, ReportStatus } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class CreateReportDto {
  @IsOptional()
  @IsUUID("4")
  userId?: string;

  @IsOptional()
  @IsUUID("4")
  messageId?: string;

  @IsEnum(ReportReason)
  reason!: ReportReason;

  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  details?: string;
}

export class ReviewReportDto {
  @IsEnum(ReportStatus)
  status!: ReportStatus;

  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  resolution?: string;
}
