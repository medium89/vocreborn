CREATE TABLE "chaos" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "moderator_id" UUID NOT NULL,
    "reason" VARCHAR(500),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chaos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "chaos_user_id_expires_at_idx" ON "chaos"("user_id", "expires_at");
ALTER TABLE "chaos" ADD CONSTRAINT "chaos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chaos" ADD CONSTRAINT "chaos_moderator_id_fkey" FOREIGN KEY ("moderator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
