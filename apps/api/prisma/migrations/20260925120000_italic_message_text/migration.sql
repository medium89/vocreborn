INSERT INTO "gift_catalog" ("id", "category_id", "name", "description", "emoji", "price", "position", "kind", "effect_key", "image_key") VALUES
('cosmetic-italic-text', 'text', 'Курсивный текст сообщений', 'Выделите сообщения курсивом в чате', '𝐼', 100, 36, 'cosmetic', 'italicText', NULL)
ON CONFLICT ("id") DO NOTHING;
