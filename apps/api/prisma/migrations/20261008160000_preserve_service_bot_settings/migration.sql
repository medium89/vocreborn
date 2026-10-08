UPDATE "users"
SET "display_name" = 'Сова Надзиратель', "gender" = 'UNSPECIFIED'
WHERE "username" = 'tusova_overseer'
  AND "is_bot" = true AND "display_name" = 'Сова надзиратель';
