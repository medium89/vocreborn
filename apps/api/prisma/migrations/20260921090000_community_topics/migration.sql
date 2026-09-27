CREATE TABLE "community_topics" ("id" UUID NOT NULL, "community_id" UUID NOT NULL, "name" VARCHAR(60) NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "community_topics_pkey" PRIMARY KEY ("id"));
ALTER TABLE "community_messages" ADD COLUMN "topic_id" UUID;
CREATE INDEX "community_topics_community_id_created_at_idx" ON "community_topics"("community_id", "created_at");
ALTER TABLE "community_messages" ADD CONSTRAINT "community_messages_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "community_topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "community_topics" ADD CONSTRAINT "community_topics_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
