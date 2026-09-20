-- DropForeignKey
ALTER TABLE "communities" DROP CONSTRAINT "communities_created_by_id_fkey";

-- DropForeignKey
ALTER TABLE "community_memberships" DROP CONSTRAINT "community_memberships_community_id_fkey";

-- DropForeignKey
ALTER TABLE "community_memberships" DROP CONSTRAINT "community_memberships_user_id_fkey";

-- DropForeignKey
ALTER TABLE "community_posts" DROP CONSTRAINT "community_posts_author_id_fkey";

-- DropForeignKey
ALTER TABLE "community_posts" DROP CONSTRAINT "community_posts_community_id_fkey";

-- DropForeignKey
ALTER TABLE "economy_entries" DROP CONSTRAINT "economy_entries_user_id_fkey";

-- DropForeignKey
ALTER TABLE "gift_inventory" DROP CONSTRAINT "gift_inventory_gift_id_fkey";

-- DropForeignKey
ALTER TABLE "gift_inventory" DROP CONSTRAINT "gift_inventory_recipient_id_fkey";

-- DropForeignKey
ALTER TABLE "gift_inventory" DROP CONSTRAINT "gift_inventory_sender_id_fkey";

-- CreateTable
CREATE TABLE "photo_albums" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "photo_albums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "album_photos" (
    "id" UUID NOT NULL,
    "album_id" UUID NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "storage_key" VARCHAR(255) NOT NULL,
    "thumbnail_key" VARCHAR(255) NOT NULL,
    "size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "album_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "photo_albums_user_id_created_at_idx" ON "photo_albums"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "album_photos_storage_key_key" ON "album_photos"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "album_photos_thumbnail_key_key" ON "album_photos"("thumbnail_key");

-- CreateIndex
CREATE INDEX "album_photos_album_id_created_at_idx" ON "album_photos"("album_id", "created_at");

-- AddForeignKey
ALTER TABLE "photo_albums" ADD CONSTRAINT "photo_albums_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "album_photos" ADD CONSTRAINT "album_photos_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "photo_albums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communities" ADD CONSTRAINT "communities_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_memberships" ADD CONSTRAINT "community_memberships_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_memberships" ADD CONSTRAINT "community_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_inventory" ADD CONSTRAINT "gift_inventory_gift_id_fkey" FOREIGN KEY ("gift_id") REFERENCES "gift_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_inventory" ADD CONSTRAINT "gift_inventory_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_inventory" ADD CONSTRAINT "gift_inventory_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "economy_entries" ADD CONSTRAINT "economy_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
