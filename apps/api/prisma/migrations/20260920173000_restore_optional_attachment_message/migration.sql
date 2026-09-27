-- Restore optional message link for temporary and profile-post attachments
ALTER TABLE "attachments" ALTER COLUMN "message_id" DROP NOT NULL;
