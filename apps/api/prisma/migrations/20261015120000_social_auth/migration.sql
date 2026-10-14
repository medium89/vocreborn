CREATE TABLE "auth_provider_configs" (
  "provider" VARCHAR(16) NOT NULL,
  "client_id" VARCHAR(255) NOT NULL,
  "secret_encrypted" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "auth_provider_configs_pkey" PRIMARY KEY ("provider")
);

CREATE TABLE "social_identities" (
  "id" UUID NOT NULL,
  "provider" VARCHAR(16) NOT NULL,
  "subject" VARCHAR(255) NOT NULL,
  "user_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "social_identities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "social_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "social_identities_provider_subject_key" ON "social_identities"("provider", "subject");
CREATE INDEX "social_identities_user_id_idx" ON "social_identities"("user_id");

CREATE TABLE "oauth_attempts" (
  "id" UUID NOT NULL,
  "token_hash" VARCHAR(64) NOT NULL,
  "provider" VARCHAR(16) NOT NULL,
  "kind" VARCHAR(8) NOT NULL,
  "code_verifier" VARCHAR(128),
  "link_user_id" UUID,
  "subject" VARCHAR(255),
  "email" VARCHAR(254),
  "email_verified" BOOLEAN NOT NULL DEFAULT false,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "oauth_attempts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "oauth_attempts_token_hash_key" ON "oauth_attempts"("token_hash");
CREATE INDEX "oauth_attempts_expires_at_idx" ON "oauth_attempts"("expires_at");
