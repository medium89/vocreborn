ALTER TABLE "messages" ADD COLUMN "reply_to_id" UUID;
CREATE INDEX "messages_reply_to_id_idx" ON "messages"("reply_to_id");
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;