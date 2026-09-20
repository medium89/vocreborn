import { Transform } from "class-transformer";
import { IsString, Length } from "class-validator";

export class SearchMessagesQueryDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @Length(1, 100)
  q!: string;
}
