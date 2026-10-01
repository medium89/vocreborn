import { IsString, Length } from "class-validator";

export class GuestLoginDto {
  @IsString()
  @Length(1, 2048)
  turnstileToken!: string;
}
