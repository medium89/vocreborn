import { Transform } from "class-transformer";
import { IsIn, IsString, Length } from "class-validator";
export class CreateSupportTicketDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString() @Length(3, 120)
  subject!: string;
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString() @Length(10, 4000)
  message!: string;
}
export class ReviewSupportTicketDto {
  @IsIn(["OPEN", "RESOLVED"])
  status!: "OPEN" | "RESOLVED";
}
