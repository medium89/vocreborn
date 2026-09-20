CREATE TABLE "gift_catalog" (
  "id" VARCHAR(64) NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "description" VARCHAR(240) NOT NULL DEFAULT '',
  "emoji" VARCHAR(16) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "position" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gift_catalog_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "gift_inventory" (
  "id" UUID NOT NULL,
  "gift_id" VARCHAR(64) NOT NULL,
  "recipient_id" UUID NOT NULL,
  "sender_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gift_inventory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gift_inventory_gift_id_fkey" FOREIGN KEY ("gift_id") REFERENCES "gift_catalog"("id") ON DELETE RESTRICT,
  CONSTRAINT "gift_inventory_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "gift_inventory_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE SET NULL
);
CREATE INDEX "gift_inventory_recipient_id_created_at_idx" ON "gift_inventory"("recipient_id", "created_at" DESC);
CREATE INDEX "gift_inventory_sender_id_created_at_idx" ON "gift_inventory"("sender_id", "created_at" DESC);
INSERT INTO "gift_catalog" ("id", "name", "description", "emoji", "position") VALUES
('flower', 'Цветок', 'Тёплый знак внимания', '🌼', 10),
('heart', 'Сердце', 'Для важных людей', '💚', 20),
('tea', 'Чашка чая', 'Немного уюта в разговор', '🍵', 30),
('star', 'Звезда', 'За яркую мысль', '⭐', 40),
('ribbon', 'Лента', 'Подарок для настроения', '🎀', 50);
