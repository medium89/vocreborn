import { ReactionType } from "@prisma/client";
import { IsEnum } from "class-validator";

export class ToggleReactionDto {
  @IsEnum(ReactionType)
  type!: ReactionType;
}