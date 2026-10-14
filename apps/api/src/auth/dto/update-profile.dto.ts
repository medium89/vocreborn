import { Transform } from "class-transformer";
import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength } from "class-validator";

export class UpdateProfileDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim().toLowerCase() : value)
  @IsOptional()
  @Matches(/^[a-z0-9_]{3,32}$/, { message: "Тег: 3–32 символа, латиница, цифры и подчёркивание" })
  username?: string;

  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @Transform(({ value }) => typeof value === "string" ? value.trim().toLowerCase() : value)
  @IsOptional()
  @IsIn(["male", "female", "unspecified"])
  gender?: "male" | "female" | "unspecified";

  @IsOptional()
  @IsBoolean()
  hideRole?: boolean;

  @IsOptional()
  @IsBoolean()
  hideDj?: boolean;
}