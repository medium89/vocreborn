import { MafiaNightActionType } from "@prisma/client";
import { IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min, ValidateIf } from "class-validator";

export class MafiaRoomDto {
  @IsString() @Length(1, 64) roomId!: string;
}

export class MafiaCreateTestDto extends MafiaRoomDto {
  @IsInt() @Min(3) @Max(11) botCount!: number;
}

export class MafiaTestMessageDto extends MafiaRoomDto {
  @IsString() @Length(1, 1000) body!: string;
  @IsIn(["ALL", "MAFIA", "DOCTOR", "COMMISSAR", "PLAYER"]) audience!: string;
  @IsOptional() @IsUUID() recipientUserId?: string;
}

export class MafiaNightActionDto extends MafiaRoomDto {
  @IsEnum(MafiaNightActionType) type!: MafiaNightActionType;
  @IsUUID() targetUserId!: string;
}

export class MafiaVoteDto extends MafiaRoomDto {
  @ValidateIf((_, value) => value !== null) @IsUUID() targetUserId!: string | null;
}

export class MafiaSecretMessageDto extends MafiaRoomDto {
  @IsString() @Length(1, 1000) body!: string;
}
