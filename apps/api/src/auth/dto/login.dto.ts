import { Transform } from "class-transformer";
import { IsEmail, IsString, Length, Matches, ValidateIf } from "class-validator";

export class LoginDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim().toLowerCase() : value)
  @ValidateIf((input) => !input.username)
  @IsEmail()
  @Length(3, 254)
  email?: string;

  // Existing integrations may still use a login name; the web form uses email.
  @Transform(({ value }) => typeof value === "string" ? value.trim().toLowerCase() : value)
  @ValidateIf((input) => !input.email)
  @IsString()
  @Matches(/^[a-z0-9_]{3,32}$/)
  username?: string;

  @IsString()
  @Length(10, 128)
  password!: string;
}
