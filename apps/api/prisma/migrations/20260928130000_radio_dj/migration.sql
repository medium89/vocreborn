-- CreateEnum
CREATE TYPE "RadioRequestStatus" AS ENUM ('WAITING', 'ACCEPTED', 'PLAYING', 'COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RadioPayment" AS ENUM ('HELD', 'CHARGED', 'REFUNDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EconomyEntryType" ADD VALUE 'RADIO_RESERVE';
ALTER TYPE "EconomyEntryType" ADD VALUE 'RADIO_REFUND';
ALTER TYPE "EconomyEntryType" ADD VALUE 'RADIO_CHARGE';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_dj" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "economy_entries" ADD COLUMN     "reference_key" VARCHAR(100);

-- CreateTable
CREATE TABLE "radio_broadcasts" (
    "id" VARCHAR(32) NOT NULL DEFAULT 'main',
    "host_id" UUID,
    "epoch" UUID,
    "accepting" BOOLEAN NOT NULL DEFAULT false,
    "price" INTEGER NOT NULL DEFAULT 5,
    "current_id" UUID,
    "started_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "radio_broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radio_uploads" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "storage_key" VARCHAR(64),
    "original_name" VARCHAR(150) NOT NULL,
    "size" INTEGER NOT NULL,
    "mime_type" VARCHAR(80) NOT NULL,
    "duration" DOUBLE PRECISION NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "radio_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radio_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "epoch" UUID NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "artist" VARCHAR(120) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "note" VARCHAR(500) NOT NULL DEFAULT '',
    "studio" BOOLEAN NOT NULL DEFAULT false,
    "price" INTEGER NOT NULL,
    "payment" "RadioPayment" NOT NULL DEFAULT 'HELD',
    "status" "RadioRequestStatus" NOT NULL DEFAULT 'WAITING',
    "decision" VARCHAR(300) NOT NULL DEFAULT '',
    "upload_id" UUID,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "radio_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "radio_uploads_expires_at_idx" ON "radio_uploads"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "radio_requests_upload_id_key" ON "radio_requests"("upload_id");

-- CreateIndex
CREATE INDEX "radio_requests_epoch_status_created_at_idx" ON "radio_requests"("epoch", "status", "created_at");

-- CreateIndex
CREATE INDEX "radio_requests_expires_at_idx" ON "radio_requests"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "radio_requests_user_id_idempotency_key_key" ON "radio_requests"("user_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "economy_entries_reference_key_key" ON "economy_entries"("reference_key");

-- AddForeignKey
ALTER TABLE "radio_broadcasts" ADD CONSTRAINT "radio_broadcasts_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radio_uploads" ADD CONSTRAINT "radio_uploads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radio_requests" ADD CONSTRAINT "radio_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radio_requests" ADD CONSTRAINT "radio_requests_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "radio_uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

