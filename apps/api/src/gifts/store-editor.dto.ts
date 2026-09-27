import { Transform } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from "class-validator";
import { COSMETIC_KEYS } from "./cosmetics";

const trimmed = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value;
export const STORE_ICONS = ["gift", "crown", "type", "palette", "images", "star", "heart", "sparkles", "gem", "ticket", "shopping-bag", "coffee", "cup-soda", "flower-2", "candy", "cake-slice", "utensils-crossed", "glass-water", "book-open", "music-2", "film", "clapperboard", "tv", "gamepad-2", "dice-5", "paw-print", "cat", "bird", "rocket", "tree-pine", "plane", "party-popper", "cake", "heart-handshake", "house", "laugh", "dumbbell", "paintbrush"] as const;

export class StoreCategoryDto {
  @Transform(trimmed) @IsString() @Length(1, 80)
  name!: string;

  @Transform(trimmed) @IsString() @Length(0, 240)
  description!: string;

  @IsIn(STORE_ICONS)
  icon!: typeof STORE_ICONS[number];

  @IsBoolean()
  active!: boolean;

  @IsInt() @Min(0) @Max(2147483647)
  position!: number;
}

export class StoreProductDto {
  @IsIn(["gift", "cosmetic"])
  kind!: "gift" | "cosmetic";

  @IsOptional() @IsIn(COSMETIC_KEYS)
  effectKey?: typeof COSMETIC_KEYS[number] | null;

  @IsOptional() @IsString() @Length(0, 255) @Matches(/^\/(store|uploads)\//)
  imageKey?: string | null;

  @IsString() @Length(1, 64)
  categoryId!: string;

  @Transform(trimmed) @IsString() @Length(1, 80)
  name!: string;

  @Transform(trimmed) @IsString() @Length(0, 240)
  description!: string;

  @Transform(trimmed) @IsString() @Length(1, 16)
  emoji!: string;

  @IsInt() @Min(1) @Max(2147483647)
  price!: number;

  @IsBoolean()
  active!: boolean;

  @IsInt() @Min(0) @Max(2147483647)
  position!: number;
}
