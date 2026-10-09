ALTER TYPE "EconomyEntryType" ADD VALUE 'CASINO_SPIN';

CREATE TABLE "casino_state" (
  "id" TEXT NOT NULL DEFAULT 'main',
  "jackpot" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "casino_state_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "casino_spins" (
  "id" UUID NOT NULL,
  "request_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "choice" VARCHAR(5) NOT NULL,
  "number" INTEGER NOT NULL,
  "color" VARCHAR(5) NOT NULL,
  "bet" INTEGER NOT NULL,
  "payout" INTEGER NOT NULL,
  "jackpot_won" INTEGER NOT NULL DEFAULT 0,
  "jackpot_chance_per_million" INTEGER NOT NULL,
  "balance_after" INTEGER NOT NULL,
  "jackpot_after" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "casino_spins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "casino_spins_request_id_key" ON "casino_spins"("request_id");
CREATE INDEX "casino_spins_user_id_created_at_idx" ON "casino_spins"("user_id", "created_at" DESC);
ALTER TABLE "casino_spins" ADD CONSTRAINT "casino_spins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
