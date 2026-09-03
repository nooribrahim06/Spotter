-- QUICK is a calorie-only or manually entered nutrition snapshot.
ALTER TYPE "MealItemType" ADD VALUE 'QUICK';

-- Unknown quick-add macros are NULL, never misleading zeroes.
ALTER TABLE "meal_items"
  ALTER COLUMN "protein_grams" DROP NOT NULL,
  ALTER COLUMN "carbohydrate_grams" DROP NOT NULL,
  ALTER COLUMN "fat_grams" DROP NOT NULL;

-- Preserve the order in which the user logged the items. Backfill safely if
-- meals were already created before this migration was applied.
ALTER TABLE "meal_items" ADD COLUMN "order_index" INTEGER;

WITH ranked_items AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "meal_id"
      ORDER BY "created_at", "id"
    ) - 1 AS "position"
  FROM "meal_items"
)
UPDATE "meal_items" AS item
SET "order_index" = ranked_items."position"
FROM ranked_items
WHERE item."id" = ranked_items."id";

ALTER TABLE "meal_items" ALTER COLUMN "order_index" SET NOT NULL;

CREATE UNIQUE INDEX "meal_items_meal_id_order_index_key"
  ON "meal_items"("meal_id", "order_index");
