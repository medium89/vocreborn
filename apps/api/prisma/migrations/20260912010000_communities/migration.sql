CREATE TYPE "CommunityJoinPolicy" AS ENUM ('OPEN', 'APPROVAL');
CREATE TYPE "CommunityMemberRole" AS ENUM ('OWNER', 'MODERATOR', 'MEMBER');
CREATE TYPE "CommunityMembershipStatus" AS ENUM ('PENDING', 'APPROVED');

CREATE TABLE "communities" (
  "id" UUID NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "description" VARCHAR(300) NOT NULL DEFAULT '',
  "join_policy" "CommunityJoinPolicy" NOT NULL DEFAULT 'OPEN',
  "created_by_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "communities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "communities_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX "communities_created_at_idx" ON "communities"("created_at");

CREATE TABLE "community_memberships" (
  "community_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" "CommunityMemberRole" NOT NULL DEFAULT 'MEMBER',
  "status" "CommunityMembershipStatus" NOT NULL DEFAULT 'APPROVED',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "community_memberships_pkey" PRIMARY KEY ("community_id", "user_id"),
  CONSTRAINT "community_memberships_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE,
  CONSTRAINT "community_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX "community_memberships_user_id_status_idx" ON "community_memberships"("user_id", "status");
CREATE INDEX "community_memberships_community_id_status_idx" ON "community_memberships"("community_id", "status");

CREATE TABLE "community_posts" (
  "id" UUID NOT NULL,
  "community_id" UUID NOT NULL,
  "author_id" UUID NOT NULL,
  "body" VARCHAR(2000) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "community_posts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "community_posts_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE,
  CONSTRAINT "community_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX "community_posts_community_id_created_at_idx" ON "community_posts"("community_id", "created_at" DESC);
