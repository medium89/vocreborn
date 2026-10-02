CREATE TABLE "push_subscriptions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "endpoint" VARCHAR(2048) NOT NULL,
  "p256dh" VARCHAR(255) NOT NULL,
  "auth" VARCHAR(255) NOT NULL,
  "direct" BOOLEAN NOT NULL DEFAULT true,
  "mention" BOOLEAN NOT NULL DEFAULT true,
  "admin_presence" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;