INSERT INTO "gift_catalog" ("id", "category_id", "name", "description", "emoji", "price", "position", "kind", "effect_key", "image_key") VALUES
('cosmetic-bold-text', 'text', 'Жирный текст сообщений', 'Выделите текст своих сообщений в чате', '𝐁', 100, 35, 'cosmetic', 'boldText', NULL)
ON CONFLICT ("id") DO NOTHING;
