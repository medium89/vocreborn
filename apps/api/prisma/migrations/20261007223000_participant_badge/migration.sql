CREATE TYPE "ParticipantBadge" AS ENUM ('MEMBER', 'QUIZ', 'SHERIFF');

ALTER TABLE "users"
ADD COLUMN "participant_badge" "ParticipantBadge" NOT NULL DEFAULT 'MEMBER';

UPDATE "users"
SET "participant_badge" = 'QUIZ'
WHERE "username" = 'tusova_quiz' AND "is_bot" = true;

UPDATE "users"
SET "participant_badge" = 'SHERIFF'
WHERE "username" = 'tusova_overseer' AND "is_bot" = true;
