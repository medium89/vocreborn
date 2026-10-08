UPDATE "users"
SET "displayName" = 'Сова Надзиратель', "gender" = 'UNSPECIFIED'
WHERE "username" = 'tusova_overseer'
  AND "is_bot" = true AND "displayName" = 'Сова надзиратель';
