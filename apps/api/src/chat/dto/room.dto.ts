import { Transform } from "class-transformer";
import { IsBoolean, IsIn, IsOptional, IsString, Length, MaxLength } from "class-validator";
export class CreateRoomDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value) @IsString() @Length(2, 80) name!: string;
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value) @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsIn(["lime", "gray", "violet", "blue"]) tone?: string;
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value) @IsOptional() @IsString() @MaxLength(12) coverEmoji?: string;
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value) @IsOptional() @IsString() @MaxLength(1000) rules?: string;
  @IsOptional() @IsIn(["public", "private"]) visibility?: string;
  @IsOptional() @IsBoolean() isVideoRoom?: boolean;
  @IsOptional() @IsBoolean() isMafiaRoom?: boolean;
}
export class UpdateRoomDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value) @IsOptional() @IsString() @Length(2, 80) name?: string;
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value) @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsIn(["lime", "gray", "violet", "blue"]) tone?: string;
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value) @IsOptional() @IsString() @MaxLength(12) coverEmoji?: string;
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value) @IsOptional() @IsString() @MaxLength(1000) rules?: string;
  @IsOptional() @IsIn(["public", "private"]) visibility?: string;
  @IsOptional() @IsBoolean() isVideoRoom?: boolean;
  @IsOptional() @IsBoolean() isMafiaRoom?: boolean;
}
