CREATE TYPE "MafiaPhase" AS ENUM ('LOBBY', 'NIGHT', 'DAY', 'VOTING', 'FINISHED');
CREATE TYPE "MafiaRole" AS ENUM ('MAFIA', 'DOCTOR', 'COMMISSAR', 'CIVILIAN');
CREATE TYPE "MafiaNightActionType" AS ENUM ('MAFIA_KILL', 'DOCTOR_PROTECT', 'COMMISSAR_CHECK');

ALTER TABLE "rooms" ADD COLUMN "is_mafia_room" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "mafia_games" (
  "id" UUID NOT NULL,
  "room_id" VARCHAR(64) NOT NULL,
  "host_user_id" UUID NOT NULL,
  "phase" "MafiaPhase" NOT NULL DEFAULT 'LOBBY',
  "round" INTEGER NOT NULL DEFAULT 0,
  "phase_ends_at" TIMESTAMP(3),
  "winner" VARCHAR(16),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mafia_games_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "mafia_games_room_id_phase_created_at_idx" ON "mafia_games" ("room_id", "phase", "created_at" DESC);
CREATE INDEX "mafia_games_phase_phase_ends_at_idx" ON "mafia_games" ("phase", "phase_ends_at");
CREATE UNIQUE INDEX "mafia_one_active_game_per_room" ON "mafia_games" ("room_id") WHERE "phase" <> 'FINISHED';
ALTER TABLE "mafia_games" ADD CONSTRAINT "mafia_games_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mafia_games" ADD CONSTRAINT "mafia_games_host_user_id_fkey" FOREIGN KEY ("host_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "mafia_players" (
  "id" UUID NOT NULL,
  "game_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "name" VARCHAR(64) NOT NULL,
  "role" "MafiaRole",
  "is_alive" BOOLEAN NOT NULL DEFAULT true,
  "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mafia_players_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mafia_players_game_id_user_id_key" ON "mafia_players" ("game_id", "user_id");
CREATE INDEX "mafia_players_game_id_is_alive_idx" ON "mafia_players" ("game_id", "is_alive");
ALTER TABLE "mafia_players" ADD CONSTRAINT "mafia_players_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "mafia_games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mafia_players" ADD CONSTRAINT "mafia_players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "mafia_night_actions" (
  "id" UUID NOT NULL,
  "game_id" UUID NOT NULL,
  "round" INTEGER NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "type" "MafiaNightActionType" NOT NULL,
  "target_user_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mafia_night_actions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mafia_night_actions_game_id_round_actor_user_id_type_key" ON "mafia_night_actions" ("game_id", "round", "actor_user_id", "type");
CREATE INDEX "mafia_night_actions_game_id_round_idx" ON "mafia_night_actions" ("game_id", "round");
ALTER TABLE "mafia_night_actions" ADD CONSTRAINT "mafia_night_actions_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "mafia_games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mafia_night_actions" ADD CONSTRAINT "mafia_night_actions_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mafia_night_actions" ADD CONSTRAINT "mafia_night_actions_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "mafia_votes" (
  "id" UUID NOT NULL,
  "game_id" UUID NOT NULL,
  "round" INTEGER NOT NULL,
  "voter_user_id" UUID NOT NULL,
  "target_user_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mafia_votes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mafia_votes_game_id_round_voter_user_id_key" ON "mafia_votes" ("game_id", "round", "voter_user_id");
CREATE INDEX "mafia_votes_game_id_round_idx" ON "mafia_votes" ("game_id", "round");
ALTER TABLE "mafia_votes" ADD CONSTRAINT "mafia_votes_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "mafia_games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mafia_votes" ADD CONSTRAINT "mafia_votes_voter_user_id_fkey" FOREIGN KEY ("voter_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mafia_votes" ADD CONSTRAINT "mafia_votes_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "mafia_secret_messages" (
  "id" UUID NOT NULL,
  "game_id" UUID NOT NULL,
  "round" INTEGER NOT NULL,
  "author_user_id" UUID NOT NULL,
  "author_name" VARCHAR(64) NOT NULL,
  "body" VARCHAR(1000) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mafia_secret_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "mafia_secret_messages_game_id_round_created_at_idx" ON "mafia_secret_messages" ("game_id", "round", "created_at");
ALTER TABLE "mafia_secret_messages" ADD CONSTRAINT "mafia_secret_messages_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "mafia_games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mafia_secret_messages" ADD CONSTRAINT "mafia_secret_messages_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
