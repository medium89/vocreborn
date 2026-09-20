import { Transform } from "class-transformer";
import { IsOptional, IsString, IsUUID, Length } from "class-validator";

export class CreateProfilePostDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @Length(1, 500)
  body!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsUUID()
  attachmentId?: string;
}
