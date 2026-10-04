ALTER TABLE "rooms" ADD COLUMN "is_video_room" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "video_room_sessions" (
  "room_id" VARCHAR(64) NOT NULL,
  "provider" VARCHAR(16),
  "video_url" TEXT,
  "controller_id" UUID,
  "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "playing" BOOLEAN NOT NULL DEFAULT false,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "video_room_sessions_pkey" PRIMARY KEY ("room_id")
);

ALTER TABLE "video_room_sessions" ADD CONSTRAINT "video_room_sessions_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;