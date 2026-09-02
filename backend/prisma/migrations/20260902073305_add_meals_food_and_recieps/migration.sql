-- CreateEnum
CREATE TYPE "MealType" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK');

-- CreateEnum
CREATE TYPE "MealItemType" AS ENUM ('FOOD', 'RECIPE');

-- CreateTable
CREATE TABLE "foods" (
    "id" UUID NOT NULL,
    "name_en" VARCHAR(200) NOT NULL,
    "name_ar" VARCHAR(200),
    "aliases" JSONB,
    "category" VARCHAR(100),
    "calories_per_100g" DECIMAL(8,2) NOT NULL,
    "protein_grams_per_100g" DECIMAL(8,2) NOT NULL,
    "carbohydrate_grams_per_100g" DECIMAL(8,2) NOT NULL,
    "fat_grams_per_100g" DECIMAL(8,2) NOT NULL,
    "created_by_user_id" UUID,
    "source" VARCHAR(50),
    "external_source_id" VARCHAR(100),
    "source_version" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "foods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipes" (
    "id" UUID NOT NULL,
    "name_en" VARCHAR(200) NOT NULL,
    "name_ar" VARCHAR(200),
    "aliases" JSONB,
    "created_by_user_id" UUID,
    "servings" DECIMAL(6,2) NOT NULL,
    "total_yield_grams" DECIMAL(10,2) NOT NULL,
    "calories_per_serving" DECIMAL(10,2) NOT NULL,
    "protein_grams_per_serving" DECIMAL(10,2) NOT NULL,
    "carbohydrate_grams_per_serving" DECIMAL(10,2) NOT NULL,
    "fat_grams_per_serving" DECIMAL(10,2) NOT NULL,
    "country_code" VARCHAR(2),
    "cuisine" VARCHAR(100),
    "instructions" TEXT,
    "source" VARCHAR(50),
    "external_source_id" VARCHAR(100),
    "source_version" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_ingredients" (
    "id" UUID NOT NULL,
    "recipe_id" UUID NOT NULL,
    "food_id" UUID NOT NULL,
    "quantity_grams" DECIMAL(10,2) NOT NULL,
    "order_index" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meals" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "meal_type" "MealType" NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "notes" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "meals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_items" (
    "id" UUID NOT NULL,
    "meal_id" UUID NOT NULL,
    "item_type" "MealItemType" NOT NULL,
    "food_id" UUID,
    "recipe_id" UUID,
    "item_name" VARCHAR(200) NOT NULL,
    "quantity_grams" DECIMAL(10,2),
    "servings" DECIMAL(8,2),
    "calories" DECIMAL(10,2) NOT NULL,
    "protein_grams" DECIMAL(10,2) NOT NULL,
    "carbohydrate_grams" DECIMAL(10,2) NOT NULL,
    "fat_grams" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meal_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "foods_name_en_idx" ON "foods"("name_en");

-- CreateIndex
CREATE INDEX "foods_category_idx" ON "foods"("category");

-- CreateIndex
CREATE INDEX "foods_created_by_user_id_idx" ON "foods"("created_by_user_id");

-- CreateIndex
CREATE INDEX "foods_is_active_idx" ON "foods"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "foods_source_external_source_id_key" ON "foods"("source", "external_source_id");

-- CreateIndex
CREATE INDEX "recipes_name_en_idx" ON "recipes"("name_en");

-- CreateIndex
CREATE INDEX "recipes_created_by_user_id_idx" ON "recipes"("created_by_user_id");

-- CreateIndex
CREATE INDEX "recipes_country_code_idx" ON "recipes"("country_code");

-- CreateIndex
CREATE INDEX "recipes_cuisine_idx" ON "recipes"("cuisine");

-- CreateIndex
CREATE INDEX "recipes_is_active_idx" ON "recipes"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "recipes_source_external_source_id_key" ON "recipes"("source", "external_source_id");

-- CreateIndex
CREATE INDEX "recipe_ingredients_recipe_id_idx" ON "recipe_ingredients"("recipe_id");

-- CreateIndex
CREATE INDEX "recipe_ingredients_food_id_idx" ON "recipe_ingredients"("food_id");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_ingredients_recipe_id_order_index_key" ON "recipe_ingredients"("recipe_id", "order_index");

-- CreateIndex
CREATE INDEX "meals_user_id_occurred_at_idx" ON "meals"("user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "meal_items_meal_id_idx" ON "meal_items"("meal_id");

-- CreateIndex
CREATE INDEX "meal_items_food_id_idx" ON "meal_items"("food_id");

-- CreateIndex
CREATE INDEX "meal_items_recipe_id_idx" ON "meal_items"("recipe_id");

-- AddForeignKey
ALTER TABLE "foods" ADD CONSTRAINT "foods_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "foods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meals" ADD CONSTRAINT "meals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "meals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "foods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
