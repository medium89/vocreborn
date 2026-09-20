import { Transform } from "class-transformer";
import { IsOptional, IsString, IsUUID, Length, Matches, MaxLength } from "class-validator";

class MessageContentDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  body?: string;

  @IsOptional()
  @IsUUID()
  attachmentId?: string;

  @IsOptional()
  @IsUUID()
  replyToId?: string;

  @IsString()
  @MaxLength(100)
  requestId!: string;
}

export class SendMessageDto extends MessageContentDto {
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z0-9_-]+$/)
  roomId!: string;
}

export class CreateRoomMessageDto extends MessageContentDto {}

export class SendDirectMessageDto extends MessageContentDto {
  @IsUUID()
  recipientId!: string;
}

export class CreateDirectMessageDto extends MessageContentDto {}
