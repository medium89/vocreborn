ALTER TABLE "mafia_games" ADD COLUMN "is_test_mode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mafia_players" ADD COLUMN "is_ai_bot" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "mafia_test_messages" (
  "id" UUID NOT NULL,
  "game_id" UUID NOT NULL,
  "round" INTEGER NOT NULL,
  "phase" "MafiaPhase" NOT NULL,
  "author_user_id" UUID NOT NULL,
  "author_name" VARCHAR(64) NOT NULL,
  "audience" VARCHAR(16) NOT NULL,
  "recipient_user_id" UUID,
  "body" VARCHAR(1000) NOT NULL,
  "turn_key" VARCHAR(160),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mafia_test_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mafia_test_messages_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "mafia_games"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "mafia_test_messages_turn_key_key" ON "mafia_test_messages" ("turn_key");
CREATE INDEX "mafia_test_messages_game_id_created_at_idx" ON "mafia_test_messages" ("game_id", "created_at");
