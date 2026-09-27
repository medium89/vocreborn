ALTER TYPE "EconomyEntryType" ADD VALUE IF NOT EXISTS 'COSMETIC_PURCHASE';

ALTER TABLE "gift_catalog"
  ADD COLUMN "kind" VARCHAR(16) NOT NULL DEFAULT 'gift',
  ADD COLUMN "effect_key" VARCHAR(32),
  ADD COLUMN "image_key" VARCHAR(255);

CREATE TABLE "user_cosmetics" (
  "user_id" UUID NOT NULL,
  "effect_key" VARCHAR(32) NOT NULL,
  "settings" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_cosmetics_pkey" PRIMARY KEY ("user_id", "effect_key"),
  CONSTRAINT "user_cosmetics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "gift_catalog" ("id","category_id","name","description","emoji","price","position","kind","effect_key","image_key") VALUES
('cosmetic-bold-nick','text','Жирный ник','Выделите имя в чате и профиле','𝐁',80,10,'cosmetic','boldNick',NULL),
('cosmetic-color-nick','text','Цветной ник','Ваш цвет имени в чате','🎨',120,20,'cosmetic','colorNick',NULL),
('cosmetic-gradient-nick','text','Градиентный ник','Плавный переход цветов в имени','🌈',200,30,'cosmetic','gradientNick',NULL),
('cosmetic-gradient-text','text','Градиентный текст','Плавный переход цветов в сообщениях','✨',220,40,'cosmetic','gradientText',NULL),
('cosmetic-picture-nick','design','Ник с картинкой','Фактура изображения внутри букв имени','🖼️',350,10,'cosmetic','pictureNick',NULL),
('cosmetic-avatar-frame','design','Рамка аватара','Выберите сияющую оправу для аватара','💠',220,20,'cosmetic','avatarFrame',NULL),
('cosmetic-profile-cover','design','Обложка профиля','Добавьте настроение шапке профиля','🏞️',250,30,'cosmetic','profileCover',NULL),
('cosmetic-custom-status','vip','Личный статус','Короткая подпись под именем','💬',160,10,'cosmetic','customStatus',NULL),
('cosmetic-vip','vip','VIP-оформление','Особый знак и расширенные фотоальбомы','👑',600,20,'cosmetic','vip',NULL)
ON CONFLICT ("id") DO NOTHING;
