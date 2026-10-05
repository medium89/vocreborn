ALTER TYPE "EconomyEntryType" ADD VALUE IF NOT EXISTS 'VIDEO_QUEUE';

ALTER TABLE "video_room_sessions"
ADD COLUMN "current_item_id" UUID;

CREATE TABLE "video_room_queue_items" (
  "id" UUID NOT NULL,
  "room_id" VARCHAR(64) NOT NULL,
  "owner_id" UUID NOT NULL,
  "provider" VARCHAR(16) NOT NULL,
  "video_url" TEXT NOT NULL,
  "title" VARCHAR(300) NOT NULL DEFAULT '',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "video_room_queue_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "video_room_queue_items"
ADD CONSTRAINT "video_room_queue_items_room_id_fkey"
FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "video_room_queue_items"
ADD CONSTRAINT "video_room_queue_items_owner_id_fkey"
FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "video_room_queue_items_room_id_created_at_id_idx"
ON "video_room_queue_items"("room_id", "created_at", "id");

CREATE INDEX "video_room_queue_items_owner_id_created_at_idx"
ON "video_room_queue_items"("owner_id", "created_at" DESC);

WITH inserted AS (
  INSERT INTO "video_room_queue_items" ("id", "room_id", "owner_id", "provider", "video_url", "created_at")
  SELECT md5("room_id" || ':video-room-queue')::uuid, "room_id", "controller_id", COALESCE("provider", 'youtube'), "video_url", "updated_at"
  FROM "video_room_sessions"
  WHERE "video_url" IS NOT NULL AND "controller_id" IS NOT NULL
  ON CONFLICT DO NOTHING
  RETURNING "id", "room_id"
)
UPDATE "video_room_sessions" AS session
SET "current_item_id" = inserted."id"
FROM inserted
WHERE session."room_id" = inserted."room_id";
