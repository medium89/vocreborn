import { IsString, Length } from "class-validator";

export class ChangePasswordDto {
  @IsString()
  @Length(10, 128)
  currentPassword!: string;

  @IsString()
  @Length(10, 128)
  newPassword!: string;
}
