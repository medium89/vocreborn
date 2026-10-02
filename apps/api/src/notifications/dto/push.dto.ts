import { IsBoolean, IsObject, IsString, IsUrl, Length } from "class-validator";

export class PushSubscriptionDto {
  @IsUrl({ require_tld: true }) endpoint!: string;
  @IsObject() keys!: { p256dh: string; auth: string };
  @IsBoolean() direct!: boolean;
  @IsBoolean() mention!: boolean;
  @IsBoolean() adminPresence!: boolean;
  @IsBoolean() adminMessages!: boolean;
}

export class PushRemoveDto { @IsString() @Length(1, 2048) endpoint!: string; }