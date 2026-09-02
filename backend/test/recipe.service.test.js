import assert from "node:assert/strict";
import { test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  "postgresql://spotter:spotter@localhost:5432/spotter_test";

const {
  createRecipe,
  deleteRecipe,
  getRecipeById,
  replaceRecipe,
  searchRecipes,
} = await import("../src/modules/recipes/recipe.service.js");

const userId = "11111111-1111-4111-8111-111111111111";
const recipeId = "22222222-2222-4222-8222-222222222222";
const chickenId = "33333333-3333-4333-8333-333333333333";
const riceId = "44444444-4444-4444-8444-444444444444";
const timestamp = new Date("2026-09-02T08:00:00.000Z");

const foods = [
  {
    id: chickenId,
    nameEn: "Chicken breast",
    nameAr: null,
    category: "Protein",
    caloriesPer100g: "165.00",
    proteinGramsPer100g: "31.00",
    carbohydrateGramsPer100g: "0.00",
    fatGramsPer100g: "3.60",
  },
  {
    id: riceId,
    nameEn: "Rice",
    nameAr: null,
    category: "Grains",
    caloriesPer100g: "130.00",
    proteinGramsPer100g: "2.70",
    carbohydrateGramsPer100g: "28.00",
    fatGramsPer100g: "0.30",
  },
];

function recipeInput(overrides = {}) {
  return {
    nameEn: "Chicken rice bowl",
    nameAr: null,
    servings: 2,
    countryCode: "EG",
    cuisine: "Egyptian",
    instructions: "Cook and serve.",
    ingredients: [
      { foodId: chickenId, quantityGrams: 200 },
      { foodId: riceId, quantityGrams: 100 },
    ],
    ...overrides,
  };
}

function recipeRecord(overrides = {}) {
  return {
    id: recipeId,
    nameEn: "Chicken rice bowl",
    nameAr: null,
    aliases: null,
    createdByUserId: userId,
    servings: "2.00",
    totalYieldGrams: "300.00",
    caloriesPerServing: "230.00",
    proteinGramsPerServing: "32.35",
    carbohydrateGramsPerServing: "14.00",
    fatGramsPerServing: "3.75",
    countryCode: "EG",
    cuisine: "Egyptian",
    instructions: "Cook and serve.",
    ingredients: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        orderIndex: 0,
        quantityGrams: "200.00",
        food: foods[0],
      },
      {
        id: "66666666-6666-4666-8666-666666666666",
        orderIndex: 1,
        quantityGrams: "100.00",
        food: foods[1],
      },
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

test("recipe search is private, filtered, stable, and paginated", async () => {
  let findQuery;
  let countQuery;
  const db = {
    recipe: {
      async findMany(args) {
        findQuery = args;
        return [recipeRecord({ createdByUserId: null })];
      },
      async count(args) {
        countQuery = args;
        return 21;
      },
    },
  };

  const result = await searchRecipes(
    userId,
    {
      search: "chicken",
      cuisine: "Egyptian",
      countryCode: "EG",
      page: 2,
      limit: 10,
    },
    db
  );

  assert.equal(findQuery.where.isActive, true);
  assert.deepEqual(findQuery.where.OR, [
    { createdByUserId: null },
    { createdByUserId: userId },
  ]);
  assert.deepEqual(countQuery.where, findQuery.where);
  assert.deepEqual(findQuery.orderBy, [
    { nameEn: "asc" },
    { id: "asc" },
  ]);
  assert.equal(findQuery.skip, 10);
  assert.equal(findQuery.take, 10);
  assert.equal(result.items[0].canEdit, false);
  assert.equal("createdByUserId" in result.items[0], false);
  assert.deepEqual(result.pagination, {
    page: 2,
    limit: 10,
    totalItems: 21,
    totalPages: 3,
    hasPreviousPage: true,
    hasNextPage: true,
  });
});

test("recipe details allow global recipes without exposing ownership", async () => {
  const db = {
    recipe: {
      async findFirst() {
        return recipeRecord({ createdByUserId: null });
      },
    },
  };

  const result = await getRecipeById(userId, recipeId, db);

  assert.equal(result.canEdit, false);
  assert.equal(result.ingredients.length, 2);
  assert.equal(result.ingredients[0].quantityGrams, 200);
  assert.equal("createdByUserId" in result, false);
});

test("an inaccessible recipe is returned as not found", async () => {
  const db = {
    recipe: {
      async findFirst() {
        return null;
      },
    },
  };

  await assert.rejects(
    getRecipeById(userId, recipeId, db),
    (error) =>
      error.code === "RECIPE_NOT_FOUND" && error.statusCode === 404
  );
});

test("recipe creation calculates nutrition and ownership on the server", async () => {
  let foodQuery;
  let createQuery;
  const db = {
    food: {
      async findMany(args) {
        foodQuery = args;
        return foods;
      },
    },
    recipe: {
      async create(args) {
        createQuery = args;
        return recipeRecord({
          ...args.data,
          ingredients: recipeRecord().ingredients,
        });
      },
    },
  };

  const result = await createRecipe(userId, recipeInput(), db);

  assert.deepEqual(foodQuery.where.OR, [
    { createdByUserId: null },
    { createdByUserId: userId },
  ]);
  assert.equal(createQuery.data.createdByUserId, userId);
  assert.equal(Number(createQuery.data.totalYieldGrams), 300);
  assert.equal(Number(createQuery.data.caloriesPerServing), 230);
  assert.equal(Number(createQuery.data.proteinGramsPerServing), 32.35);
  assert.equal(
    Number(createQuery.data.carbohydrateGramsPerServing),
    14
  );
  assert.equal(Number(createQuery.data.fatGramsPerServing), 3.75);
  assert.equal(createQuery.data.ingredients.create.length, 2);
  assert.equal(result.canEdit, true);
});

test("recipe creation rejects an unavailable ingredient before writing", async () => {
  let createCalled = false;
  const db = {
    food: {
      async findMany() {
        return [foods[0]];
      },
    },
    recipe: {
      async create() {
        createCalled = true;
      },
    },
  };

  await assert.rejects(
    createRecipe(userId, recipeInput(), db),
    (error) =>
      error.code === "INVALID_RECIPE_INGREDIENTS" &&
      error.statusCode === 409
  );
  assert.equal(createCalled, false);
});

test("recipe replacement is owner-only and atomically replaces ingredients", async () => {
  let updateQuery;
  let deleteQuery;
  let ingredientRows;
  const tx = {
    recipe: {
      async updateMany(args) {
        updateQuery = args;
        return { count: 1 };
      },
      async findUnique() {
        return recipeRecord();
      },
    },
    recipeIngredient: {
      async deleteMany(args) {
        deleteQuery = args;
      },
      async createMany({ data }) {
        ingredientRows = data;
      },
    },
  };
  const db = {
    recipe: {
      async findFirst() {
        return { id: recipeId };
      },
    },
    food: {
      async findMany() {
        return foods;
      },
    },
    async $transaction(callback) {
      return callback(tx);
    },
  };

  const result = await replaceRecipe(
    userId,
    recipeId,
    recipeInput(),
    db
  );

  assert.deepEqual(updateQuery.where, {
    id: recipeId,
    createdByUserId: userId,
    isActive: true,
  });
  assert.deepEqual(deleteQuery.where, { recipeId });
  assert.equal(ingredientRows.length, 2);
  assert.equal(ingredientRows[0].recipeId, recipeId);
  assert.equal(result.canEdit, true);
});

test("a global or another user's recipe cannot be replaced", async () => {
  let transactionCalled = false;
  const db = {
    recipe: {
      async findFirst() {
        return null;
      },
    },
    async $transaction() {
      transactionCalled = true;
    },
  };

  await assert.rejects(
    replaceRecipe(userId, recipeId, recipeInput(), db),
    (error) => error.code === "RECIPE_NOT_FOUND"
  );
  assert.equal(transactionCalled, false);
});

test("recipe deletion archives only an active owned recipe", async () => {
  let updateQuery;
  const db = {
    recipe: {
      async updateMany(args) {
        updateQuery = args;
        return { count: 1 };
      },
    },
  };

  await deleteRecipe(userId, recipeId, db);

  assert.deepEqual(updateQuery.where, {
    id: recipeId,
    createdByUserId: userId,
    isActive: true,
  });
  assert.equal(updateQuery.data.isActive, false);
  assert.ok(updateQuery.data.archivedAt instanceof Date);
});

test("deleting an unowned recipe returns not found", async () => {
  const db = {
    recipe: {
      async updateMany() {
        return { count: 0 };
      },
    },
  };

  await assert.rejects(
    deleteRecipe(userId, recipeId, db),
    (error) =>
      error.code === "RECIPE_NOT_FOUND" && error.statusCode === 404
  );
});
