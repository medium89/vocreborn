import { IsString, Matches, MaxLength } from "class-validator";

export class JoinRoomDto {
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z0-9_-]+$/)
  roomId!: string;
}
