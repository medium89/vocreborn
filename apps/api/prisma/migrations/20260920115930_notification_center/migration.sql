/*
  Warnings:

  - Made the column `message_id` on table `attachments` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'GIFT';
ALTER TYPE "NotificationType" ADD VALUE 'PROFILE_POST';
ALTER TYPE "NotificationType" ADD VALUE 'PROFILE_POST_REPLY';
ALTER TYPE "NotificationType" ADD VALUE 'MUTE';
ALTER TYPE "NotificationType" ADD VALUE 'UNMUTE';
ALTER TYPE "NotificationType" ADD VALUE 'BAN';
ALTER TYPE "NotificationType" ADD VALUE 'UNBAN';
ALTER TYPE "NotificationType" ADD VALUE 'PHOTO_LIKE';
ALTER TYPE "NotificationType" ADD VALUE 'PHOTO_COMMENT';

-- DropForeignKey
ALTER TABLE "attachments" DROP CONSTRAINT "attachments_profile_post_id_fkey";

-- DropIndex
DROP INDEX "notifications_user_id_actor_id_message_id_type_key";

-- AlterTable
ALTER TABLE "attachments" ALTER COLUMN "message_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "gift_inventory_id" UUID,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "photo_id" UUID,
ADD COLUMN     "profile_post_id" UUID,
ALTER COLUMN "message_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "photo_likes" (
    "id" UUID NOT NULL,
    "photo_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photo_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photo_comments" (
    "id" UUID NOT NULL,
    "photo_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photo_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "photo_likes_user_id_created_at_idx" ON "photo_likes"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "photo_likes_photo_id_user_id_key" ON "photo_likes"("photo_id", "user_id");

-- CreateIndex
CREATE INDEX "photo_comments_photo_id_created_at_idx" ON "photo_comments"("photo_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_actor_id_message_id_type_idx" ON "notifications"("user_id", "actor_id", "message_id", "type");

-- CreateIndex
CREATE INDEX "notifications_user_id_actor_id_profile_post_id_type_idx" ON "notifications"("user_id", "actor_id", "profile_post_id", "type");

-- CreateIndex
CREATE INDEX "notifications_user_id_actor_id_photo_id_type_idx" ON "notifications"("user_id", "actor_id", "photo_id", "type");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_profile_post_id_fkey" FOREIGN KEY ("profile_post_id") REFERENCES "profile_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_gift_inventory_id_fkey" FOREIGN KEY ("gift_inventory_id") REFERENCES "gift_inventory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "album_photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_profile_post_id_fkey" FOREIGN KEY ("profile_post_id") REFERENCES "profile_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_likes" ADD CONSTRAINT "photo_likes_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "album_photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_likes" ADD CONSTRAINT "photo_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_comments" ADD CONSTRAINT "photo_comments_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "album_photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_comments" ADD CONSTRAINT "photo_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
