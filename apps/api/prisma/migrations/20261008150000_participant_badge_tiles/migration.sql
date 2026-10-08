ALTER TABLE "users"
  ADD COLUMN "participant_badges" JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE "users" AS u
SET "participant_badges" = COALESCE((
  SELECT jsonb_agg(jsonb_build_object(
    'id', md5(u.id::text || ':' || item.ordinality::text),
    'label', btrim(item.label),
    'icon', u."participant_badge_icon",
    'outlined', u."participant_badge_outlined",
    'backgroundColor', u."participant_badge_background_color",
    'borderColor', u."participant_badge_border_color"
  ) ORDER BY item.ordinality)
  FROM regexp_split_to_table(u."participant_badge", E'\\r?\\n') WITH ORDINALITY AS item(label, ordinality)
  WHERE btrim(item.label) <> '' AND btrim(item.label) <> 'member'
), '[]'::jsonb);
