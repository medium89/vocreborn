ALTER TABLE "users"
  ADD COLUMN "rating" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "credits" INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN "last_rating_at" TIMESTAMP(3),
  ADD COLUMN "rating_award_day" TIMESTAMP(3),
  ADD COLUMN "rating_awards_today" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "gift_catalog" ADD COLUMN "price" INTEGER NOT NULL DEFAULT 5;

UPDATE "gift_catalog" SET "price" = CASE "id"
  WHEN 'flower' THEN 5 WHEN 'heart' THEN 15 WHEN 'tea' THEN 20
  WHEN 'star' THEN 30 WHEN 'ribbon' THEN 40 ELSE "price" END;

CREATE TYPE "EconomyEntryType" AS ENUM ('MESSAGE_RATING', 'DAILY_ACTIVITY_CREDIT', 'GIFT_PURCHASE');

CREATE TABLE "economy_entries" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "type" "EconomyEntryType" NOT NULL,
  "rating_delta" INTEGER NOT NULL DEFAULT 0,
  "credits_delta" INTEGER NOT NULL DEFAULT 0,
  "balance_after" INTEGER NOT NULL,
  "message_id" UUID,
  "gift_id" VARCHAR(64),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "economy_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "economy_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "economy_entries_message_id_key" ON "economy_entries"("message_id");
CREATE INDEX "economy_entries_user_id_created_at_idx" ON "economy_entries"("user_id", "created_at" DESC);
