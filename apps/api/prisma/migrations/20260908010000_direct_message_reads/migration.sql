-- Track when a direct message was read by its recipient.
ALTER TABLE "messages" ADD COLUMN "read_at" TIMESTAMP(3);

-- Support unread counters and inbox queries.
CREATE INDEX "messages_recipient_id_read_at_created_at_idx"
ON "messages"("recipient_id", "read_at", "created_at" DESC);