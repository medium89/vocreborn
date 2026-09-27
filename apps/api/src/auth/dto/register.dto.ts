import { Transform } from "class-transformer";
import { IsEmail, IsString, Length, Matches } from "class-validator";

export class RegisterDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim().toLowerCase() : value)
  @IsString()
  @Matches(/^[a-z0-9_]{3,32}$/, {
    message: "Логин: 3–32 символа, латиница, цифры и подчёркивание",
  })
  username!: string;

  @Transform(({ value }) => typeof value === "string" ? value.trim().toLowerCase() : value)
  @IsEmail()
  @Length(3, 254)
  email!: string;

  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @Length(2, 64)
  displayName!: string;

  @IsString()
  @Length(10, 128)
  password!: string;
}
