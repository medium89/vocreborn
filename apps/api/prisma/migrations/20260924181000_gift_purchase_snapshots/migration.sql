ALTER TABLE "gift_inventory"
  ADD COLUMN "gift_name" VARCHAR(80),
  ADD COLUMN "gift_description" VARCHAR(240),
  ADD COLUMN "gift_emoji" VARCHAR(16),
  ADD COLUMN "gift_price" INTEGER;

UPDATE "gift_inventory" AS inventory
SET "gift_name" = catalog."name",
    "gift_description" = catalog."description",
    "gift_emoji" = catalog."emoji",
    "gift_price" = catalog."price"
FROM "gift_catalog" AS catalog
WHERE inventory."gift_id" = catalog."id";

ALTER TABLE "gift_inventory"
  ALTER COLUMN "gift_name" SET NOT NULL,
  ALTER COLUMN "gift_description" SET NOT NULL,
  ALTER COLUMN "gift_emoji" SET NOT NULL,
  ALTER COLUMN "gift_price" SET NOT NULL;
