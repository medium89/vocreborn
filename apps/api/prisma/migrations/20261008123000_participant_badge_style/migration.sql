ALTER TABLE "users"
  ADD COLUMN "participant_badge_outlined" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "participant_badge_background_color" VARCHAR(7) NOT NULL DEFAULT '',
  ADD COLUMN "participant_badge_border_color" VARCHAR(7) NOT NULL DEFAULT '';
