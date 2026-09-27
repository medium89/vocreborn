import { Transform } from "class-transformer";
import { IsEmail, IsString, Length } from "class-validator";

export class EmailAddressDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim().toLowerCase() : value)
  @IsEmail()
  @Length(3, 254)
  email!: string;
}

export class SetEmailDto extends EmailAddressDto {
  @IsString()
  @Length(10, 128)
  currentPassword!: string;
}

export class EmailTokenDto {
  @IsString()
  @Length(32, 128)
  token!: string;
}

export class EmailPasswordResetDto extends EmailTokenDto {
  @IsString()
  @Length(10, 128)
  newPassword!: string;
}
