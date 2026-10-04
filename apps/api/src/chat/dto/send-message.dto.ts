import { Transform } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, IsUUID, IsUrl, Length, Matches, MaxLength } from "class-validator";

class MessageContentDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  body?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID()
  mentionUserIds?: string[];

  @IsOptional()
  @IsUUID()
  attachmentId?: string;

  @IsOptional()
  @IsUUID()
  replyToId?: string;

  @IsOptional()
  @IsString()
  @IsUrl({ protocols: ["https"], require_protocol: true })
  @MaxLength(2048)
  gifUrl?: string;

  @IsString()
  @MaxLength(100)
  requestId!: string;
}

class RoomMessageContentDto extends MessageContentDto {
  @IsOptional()
  @IsBoolean()
  adminVoice?: boolean;
}

export class SendMessageDto extends RoomMessageContentDto {
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z0-9_-]+$/)
  roomId!: string;
}

export class CreateRoomMessageDto extends RoomMessageContentDto {}

export class SendDirectMessageDto extends MessageContentDto {
  @IsUUID()
  recipientId!: string;
}

export class CreateDirectMessageDto extends MessageContentDto {}
export class EditMessageDto { @Transform(({ value }) => typeof value === "string" ? value.trim() : value) @IsString() @Length(1, 1000) body!: string; }
