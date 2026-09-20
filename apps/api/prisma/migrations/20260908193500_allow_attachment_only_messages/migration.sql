-- Attachment-only messages are validated by ChatService.
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_body_not_blank";
