import { IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class VideoRoomStateDto {
  @IsString() @MaxLength(64) roomId!: string;
}

export class SetVideoRoomSourceDto {
  @IsString() @MaxLength(64) roomId!: string;
  @IsString() @MaxLength(2000) videoUrl!: string;
}

export class ControlVideoRoomDto {
  @IsString() @MaxLength(64) roomId!: string;
  @IsIn(["play", "pause", "seek"]) action!: "play" | "pause" | "seek";
  @IsOptional() @IsNumber() @Min(0) @Max(86400) position?: number;
}

export class VideoQueueItemDto {
  @IsString() @MaxLength(64) roomId!: string;
  @IsString() @MaxLength(64) itemId!: string;
}

export class VideoRoomEndedDto extends VideoQueueItemDto {}

export class VideoRoomTitleDto extends VideoQueueItemDto {
  @IsString() @MaxLength(300) title!: string;
}
