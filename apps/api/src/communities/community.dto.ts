import { Transform } from "class-transformer";
import { IsIn, IsOptional, IsString, Length, MaxLength } from "class-validator";

export class CreateCommunityDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value) @IsString() @Length(2, 80) name!: string;
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value) @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsIn(["open", "approval"]) joinPolicy?: "open" | "approval";
}

export class UpdateCommunityDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value) @IsOptional() @IsString() @Length(2, 80) name?: string;
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value) @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsIn(["open", "approval"]) joinPolicy?: "open" | "approval";
}

export class CreateCommunityPostDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value) @IsString() @Length(1, 2000) body!: string;
}

export class MembershipRoleDto {
  @IsIn(["moderator", "member"]) role!: "moderator" | "member";
}

export class RequestDecisionDto {
  @IsIn(["approve", "reject"]) decision!: "approve" | "reject";
}
