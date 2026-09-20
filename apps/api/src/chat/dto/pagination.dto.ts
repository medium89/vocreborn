import { IsOptional, IsUUID } from "class-validator";

export class MessagePageQueryDto {
  @IsOptional()
  @IsUUID("4")
  cursor?: string;
}
