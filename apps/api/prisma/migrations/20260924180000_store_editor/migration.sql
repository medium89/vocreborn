CREATE TABLE "store_categories" (
  "id" VARCHAR(64) NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "description" VARCHAR(240) NOT NULL DEFAULT '',
  "icon" VARCHAR(32) NOT NULL DEFAULT 'gift',
  "image_key" VARCHAR(255),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "position" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "store_categories_pkey" PRIMARY KEY ("id")
);

INSERT INTO "store_categories" ("id", "name", "description", "icon", "position") VALUES
  ('gifts', 'Подарки', 'Тёплые знаки внимания', 'gift', 10),
  ('vip', 'VIP и статус', 'Особые возможности', 'crown', 20),
  ('text', 'Текст', 'Оформление сообщений', 'type', 30),
  ('design', 'Оформление', 'Персональный стиль', 'palette', 40),
  ('albums', 'Фотоальбом', 'Место для воспоминаний', 'images', 50);

ALTER TABLE "gift_catalog" ADD COLUMN "category_id" VARCHAR(64) NOT NULL DEFAULT 'gifts';
ALTER TABLE "gift_catalog" ADD COLUMN "deleted_at" TIMESTAMP(3);

ALTER TABLE "gift_catalog" ADD CONSTRAINT "gift_catalog_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "store_categories"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "store_categories_active_position_idx" ON "store_categories"("active", "position");
CREATE INDEX "gift_catalog_category_id_active_position_idx" ON "gift_catalog"("category_id", "active", "position");
