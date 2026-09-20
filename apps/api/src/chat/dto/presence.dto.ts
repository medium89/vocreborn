import { IsIn } from "class-validator";

export class UpdatePresenceDto {
  @IsIn(["online", "away", "dnd"])
  status!: "online" | "away" | "dnd";
}
