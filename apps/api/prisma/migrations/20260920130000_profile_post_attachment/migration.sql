ALTER TABLE "attachments" ADD COLUMN "profile_post_id" UUID;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_profile_post_id_fkey" FOREIGN KEY ("profile_post_id") REFERENCES "profile_posts"("id") ON DELETE CASCADE;
CREATE UNIQUE INDEX "attachments_profile_post_id_key" ON "attachments"("profile_post_id");
