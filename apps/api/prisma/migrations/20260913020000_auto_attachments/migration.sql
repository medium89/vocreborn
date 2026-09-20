ALTER TABLE "attachments" ADD COLUMN "preview_storage_key" VARCHAR(255);
CREATE UNIQUE INDEX "attachments_preview_storage_key_key" ON "attachments"("preview_storage_key");
UPDATE "attachments" SET "status" = 'APPROVED', "reviewed_at" = COALESCE("reviewed_at", CURRENT_TIMESTAMP) WHERE "status" = 'PENDING';
