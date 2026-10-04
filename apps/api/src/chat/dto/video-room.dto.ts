import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class SetVideoRoomSourceDto {
  @IsString() @MaxLength(64) roomId!: string;
  @IsString() @MaxLength(2000) videoUrl!: string;
}

export class ControlVideoRoomDto {
  @IsString() @MaxLength(64) roomId!: string;
  @IsIn(["play", "pause", "seek"]) action!: "play" | "pause" | "seek";
  @IsOptional() @IsNumber() @Min(0) @Max(86400) position?: number;
  @IsOptional() @IsBoolean() playing?: boolean;
}