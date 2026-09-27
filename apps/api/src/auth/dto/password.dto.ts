import { IsString, Length } from "class-validator";

export class ChangePasswordDto {
  @IsString()
  @Length(10, 128)
  currentPassword!: string;

  @IsString()
  @Length(10, 128)
  newPassword!: string;
}

export class CreateRecoveryCodeDto {
  @IsString()
  @Length(10, 128)
  currentPassword!: string;
}

export class ResetPasswordDto {
  @IsString()
  @Length(20, 80)
  code!: string;

  @IsString()
  @Length(10, 128)
  newPassword!: string;
}
