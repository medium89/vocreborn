-- Expand the economy ledger with daily rewards for distinct social actions.
ALTER TYPE "EconomyEntryType" ADD VALUE IF NOT EXISTS 'DAILY_FIRST_MESSAGE';
ALTER TYPE "EconomyEntryType" ADD VALUE IF NOT EXISTS 'DAILY_FIRST_REPLY';
ALTER TYPE "EconomyEntryType" ADD VALUE IF NOT EXISTS 'DAILY_PROFILE_COMMENT';
ALTER TYPE "EconomyEntryType" ADD VALUE IF NOT EXISTS 'DAILY_PHOTO_LIKE';
ALTER TYPE "EconomyEntryType" ADD VALUE IF NOT EXISTS 'DAILY_PROFILE_POST_LIKE';

CREATE TYPE "DailyActivityAction" AS ENUM (
  'FIRST_MESSAGE',
  'FIRST_REPLY',
  'PROFILE_COMMENT',
  'PHOTO_LIKE',
  'PROFILE_POST_LIKE'
);

CREATE TABLE "profile_post_likes" (
  "id" UUID NOT NULL,
  "post_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "profile_post_likes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "profile_post_likes_post_id_user_id_key"
  ON "profile_post_likes"("post_id", "user_id");
CREATE INDEX "profile_post_likes_user_id_created_at_idx"
  ON "profile_post_likes"("user_id", "created_at");

ALTER TABLE "profile_post_likes"
  ADD CONSTRAINT "profile_post_likes_post_id_fkey"
  FOREIGN KEY ("post_id") REFERENCES "profile_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "profile_post_likes"
  ADD CONSTRAINT "profile_post_likes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "daily_activity_rewards" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "action" "DailyActivityAction" NOT NULL,
  "day" DATE NOT NULL,
  "credits" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "daily_activity_rewards_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "daily_activity_rewards_user_id_action_day_key"
  ON "daily_activity_rewards"("user_id", "action", "day");
CREATE INDEX "daily_activity_rewards_user_id_day_idx"
  ON "daily_activity_rewards"("user_id", "day");

ALTER TABLE "daily_activity_rewards"
  ADD CONSTRAINT "daily_activity_rewards_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
