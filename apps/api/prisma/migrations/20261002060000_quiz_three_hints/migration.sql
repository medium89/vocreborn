ALTER TABLE "quiz_config" ADD COLUMN "hint3_seconds" INTEGER NOT NULL DEFAULT 75;
ALTER TABLE "quiz_rounds" ADD COLUMN "hint3_at" TIMESTAMP(3);
UPDATE "quiz_rounds" SET "hint3_at" = "hint2_at" + (("ends_at" - "hint2_at") / 2) WHERE "hint3_at" IS NULL;
ALTER TABLE "quiz_rounds" ALTER COLUMN "hint3_at" SET NOT NULL;
