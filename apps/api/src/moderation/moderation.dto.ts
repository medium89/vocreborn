import { Transform } from "class-transformer";
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";

export class MuteUserDto {
  @IsUUID("4")
  userId!: string;

  @IsInt()
  @Min(1)
  @Max(43_200)
  durationMinutes!: number;

  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class BanUserDto {
  @IsUUID("4")
  userId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(525_600)
  durationMinutes?: number;

  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
