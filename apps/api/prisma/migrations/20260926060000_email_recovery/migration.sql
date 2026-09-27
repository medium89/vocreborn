ALTER TABLE "users"
  ADD COLUMN "email" VARCHAR(254),
  ADD COLUMN "email_verified_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "email_tokens" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "token_hash" VARCHAR(64) NOT NULL,
  "purpose" VARCHAR(16) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_tokens_token_hash_key" ON "email_tokens"("token_hash");
CREATE INDEX "email_tokens_user_id_purpose_idx" ON "email_tokens"("user_id", "purpose");
CREATE INDEX "email_tokens_expires_at_idx" ON "email_tokens"("expires_at");
ALTER TABLE "email_tokens" ADD CONSTRAINT "email_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
