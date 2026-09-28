-- AlterEnum
ALTER TYPE "EconomyEntryType" ADD VALUE 'QUIZ_REWARD';

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "quiz_accepted_at" TIMESTAMP(3),
ADD COLUMN     "quiz_kind" VARCHAR(16),
ADD COLUMN     "quiz_round_id" UUID;

-- CreateTable
CREATE TABLE "quiz_config" (
    "id" VARCHAR(32) NOT NULL DEFAULT 'main',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Barnaul',
    "windows" JSONB NOT NULL DEFAULT '[{"days":[0,1,2,3,4,5,6],"start":"00:00","end":"24:00"}]',
    "interval_seconds" INTEGER NOT NULL DEFAULT 300,
    "duration_seconds" INTEGER NOT NULL DEFAULT 90,
    "hint1_seconds" INTEGER NOT NULL DEFAULT 30,
    "hint2_seconds" INTEGER NOT NULL DEFAULT 60,
    "reward" INTEGER NOT NULL DEFAULT 5,
    "min_online" INTEGER NOT NULL DEFAULT 2,
    "daily_questions" INTEGER NOT NULL DEFAULT 200,
    "daily_budget" INTEGER NOT NULL DEFAULT 1000,
    "player_daily_wins" INTEGER NOT NULL DEFAULT 10,
    "player_daily_credits" INTEGER NOT NULL DEFAULT 50,
    "no_repeat_hours" INTEGER NOT NULL DEFAULT 24,
    "random_order" BOOLEAN NOT NULL DEFAULT false,
    "recycle" BOOLEAN NOT NULL DEFAULT true,
    "excluded_user_ids" UUID[],
    "active_round_id" UUID,
    "next_at" TIMESTAMP(3),
    "last_reason" VARCHAR(200),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quiz_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_themes" (
    "id" UUID NOT NULL,
    "external_id" VARCHAR(64) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quiz_themes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_questions" (
    "id" UUID NOT NULL,
    "theme_id" UUID NOT NULL,
    "external_id" VARCHAR(64) NOT NULL,
    "position" INTEGER NOT NULL,
    "question" VARCHAR(1000) NOT NULL,
    "answer" VARCHAR(100) NOT NULL,
    "accepted_answers" TEXT[],
    "asked_count" INTEGER NOT NULL DEFAULT 0,
    "last_asked_at" TIMESTAMP(3),

    CONSTRAINT "quiz_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_rounds" (
    "id" UUID NOT NULL,
    "theme_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "theme_title" VARCHAR(120) NOT NULL,
    "revision" INTEGER NOT NULL,
    "question" VARCHAR(1000) NOT NULL,
    "answer" VARCHAR(100) NOT NULL,
    "accepted_answers" TEXT[],
    "hint_positions" INTEGER[],
    "hints_sent" INTEGER NOT NULL DEFAULT 0,
    "hint1_at" TIMESTAMP(3) NOT NULL,
    "hint2_at" TIMESTAMP(3) NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "day_key" VARCHAR(90) NOT NULL,
    "reward" INTEGER NOT NULL,
    "player_daily_wins" INTEGER NOT NULL,
    "player_daily_credits" INTEGER NOT NULL,
    "winner_id" UUID,
    "winner_name" VARCHAR(64),
    "winning_message_id" UUID,
    "cursor_at" TIMESTAMP(3) NOT NULL,
    "cursor_id" UUID,

    CONSTRAINT "quiz_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_attempts" (
    "round_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "last_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("round_id","user_id")
);

-- CreateTable
CREATE TABLE "quiz_publications" (
    "message_id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "reward_user_id" UUID,
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_publications_pkey" PRIMARY KEY ("message_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quiz_themes_external_id_key" ON "quiz_themes"("external_id");

-- CreateIndex
CREATE INDEX "quiz_questions_last_asked_at_asked_count_idx" ON "quiz_questions"("last_asked_at", "asked_count");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_questions_theme_id_external_id_key" ON "quiz_questions"("theme_id", "external_id");

-- CreateIndex
CREATE INDEX "quiz_rounds_day_key_status_idx" ON "quiz_rounds"("day_key", "status");

-- CreateIndex
CREATE INDEX "quiz_rounds_winner_id_day_key_status_idx" ON "quiz_rounds"("winner_id", "day_key", "status");

-- CreateIndex
CREATE INDEX "quiz_rounds_started_at_idx" ON "quiz_rounds"("started_at" DESC);

-- CreateIndex
CREATE INDEX "quiz_publications_delivered_at_created_at_idx" ON "quiz_publications"("delivered_at", "created_at");

-- CreateIndex
CREATE INDEX "messages_room_id_quiz_accepted_at_id_idx" ON "messages"("room_id", "quiz_accepted_at", "id");

-- AddForeignKey
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "quiz_themes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_rounds" ADD CONSTRAINT "quiz_rounds_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "quiz_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
