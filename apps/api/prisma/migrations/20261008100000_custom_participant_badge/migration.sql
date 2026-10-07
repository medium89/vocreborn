ALTER TABLE "users"
  ALTER COLUMN "participant_badge" DROP DEFAULT,
  ALTER COLUMN "participant_badge" TYPE VARCHAR(48) USING lower("participant_badge"::text),
  ALTER COLUMN "participant_badge" SET DEFAULT 'member';

DROP TYPE "ParticipantBadge";
