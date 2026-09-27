ALTER TABLE "attachments" ADD COLUMN "community_message_id" UUID;
CREATE UNIQUE INDEX "attachments_community_message_id_key" ON "attachments"("community_message_id");
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_community_message_id_fkey" FOREIGN KEY ("community_message_id") REFERENCES "community_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
