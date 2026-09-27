-- Keep legacy products and purchase history intact; hide only the old storefront category.
UPDATE "store_categories" SET "active" = FALSE WHERE "id" = 'gifts' AND "deleted_at" IS NULL;

INSERT INTO "store_categories" ("id", "name", "description", "icon", "position") VALUES
  ('coffee', 'Кофе', 'Ароматные поводы заглянуть в чат', 'coffee', 100),
  ('tea', 'Чай', 'Тёплые чашки для ночных разговоров', 'cup-soda', 110),
  ('flowers', 'Цветы', 'Букеты и цветочные знаки внимания', 'flower-2', 120),
  ('sweets', 'Сладости', 'Конфеты и маленькие радости', 'candy', 130),
  ('desserts', 'Десерты', 'Торты и угощения', 'cake-slice', 140),
  ('food', 'Еда', 'Вкусные сюрпризы', 'utensils-crossed', 150),
  ('drinks', 'Напитки', 'Напитки на любой вкус', 'glass-water', 160),
  ('books', 'Книги', 'Истории, которыми хочется делиться', 'book-open', 170),
  ('music', 'Музыка', 'Мелодии и настроение', 'music-2', 180),
  ('movies', 'Фильмы', 'Кино для совместных вечеров', 'film', 190),
  ('cartoons', 'Мультфильмы', 'Любимые герои и добрые истории', 'clapperboard', 200),
  ('series', 'Сериалы', 'Истории на много вечеров', 'tv', 210),
  ('games', 'Игры', 'Игровое настроение', 'gamepad-2', 220),
  ('board-games', 'Настольные игры', 'Партии в хорошей компании', 'dice-5', 230),
  ('animals', 'Животные', 'Милые звери', 'paw-print', 240),
  ('cats', 'Коты', 'Кошачье очарование', 'cat', 250),
  ('owls', 'Совы', 'Ночные символы TUSOVA', 'bird', 260),
  ('space', 'Космос', 'Планеты и галактики', 'rocket', 270),
  ('stars', 'Звёзды', 'Небесные подарки', 'star', 280),
  ('nature', 'Природа', 'Лес, море и свежий воздух', 'tree-pine', 290),
  ('travel', 'Путешествия', 'Мечты о новых местах', 'plane', 300),
  ('holidays', 'Праздники', 'Поводы для радости', 'party-popper', 310),
  ('birthday', 'День рождения', 'Поздравления именинникам', 'cake', 320),
  ('romance', 'Романтика', 'Нежные знаки внимания', 'heart', 330),
  ('friendship', 'Дружба', 'Для тех, кто рядом', 'heart-handshake', 340),
  ('cozy', 'Уют', 'Тёплые мелочи', 'house', 350),
  ('memes', 'Мемы', 'Поводы улыбнуться', 'laugh', 360),
  ('sports', 'Спорт', 'Энергия и движение', 'dumbbell', 370),
  ('art', 'Арт', 'Творческие подарки', 'paintbrush', 380),
  ('surprises', 'Сюрпризы', 'Неожиданное и приятное', 'gift', 390)
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "gift_catalog" ALTER COLUMN "category_id" SET DEFAULT 'surprises';
