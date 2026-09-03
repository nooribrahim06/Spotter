import assert from "node:assert/strict";
import { test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  "postgresql://spotter:spotter@localhost:5432/spotter_test";

const {
  createMeal,
  deleteMeal,
  getMealById,
  listMeals,
  replaceMeal,
} = await import("../src/modules/meals/meal.service.js");

const userId = "11111111-1111-4111-8111-111111111111";
const mealId = "22222222-2222-4222-8222-222222222222";
const foodId = "33333333-3333-4333-8333-333333333333";
const recipeId = "44444444-4444-4444-8444-444444444444";
const itemId = "55555555-5555-4555-8555-555555555555";
const occurredAt = new Date(Date.now() - 60 * 60 * 1000);
const timestamp = new Date("2026-09-01T10:00:00.000Z");

const food = {
  id: foodId,
  nameEn: "Chicken breast",
  caloriesPer100g: "165.00",
  proteinGramsPer100g: "31.00",
  carbohydrateGramsPer100g: "0.00",
  fatGramsPer100g: "3.60",
};

const recipe = {
  id: recipeId,
  nameEn: "Chicken rice bowl",
  caloriesPerServing: "230.00",
  proteinGramsPerServing: "32.35",
  carbohydrateGramsPerServing: "14.00",
  fatGramsPerServing: "3.75",
};

function mealInput(overrides = {}) {
  return {
    mealType: "LUNCH",
    occurredAt,
    notes: null,
    items: [
      { itemType: "FOOD", foodId, quantityGrams: 200 },
      { itemType: "RECIPE", recipeId, servings: 1.5 },
      {
        itemType: "QUICK",
        itemName: "Quick add",
        calories: 300,
        proteinGrams: null,
        carbohydrateGrams: null,
        fatGrams: null,
      },
    ],
    ...overrides,
  };
}

function mealRecord(overrides = {}) {
  return {
    id: mealId,
    mealType: "LUNCH",
    occurredAt,
    notes: null,
    items: [
      {
        id: itemId,
        itemType: "FOOD",
        foodId,
        recipeId: null,
        itemName: "Chicken breast",
        orderIndex: 0,
        quantityGrams: "200.00",
        servings: null,
        calories: "330.00",
        proteinGrams: "62.00",
        carbohydrateGrams: "0.00",
        fatGrams: "7.20",
        createdAt: timestamp,
      },
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function sourceDb(mealMethods = {}) {
  return {
    food: {
      async findMany() {
        return [food];
      },
    },
    recipe: {
      async findMany() {
        return [recipe];
      },
    },
    meal: mealMethods,
  };
}

test("meal creation calculates and snapshots all three item modes", async () => {
  let createQuery;
  const db = sourceDb({
    async create(args) {
      createQuery = args;
      return mealRecord({
        ...args.data,
        items: args.data.items.create.map((item, index) => ({
          id: `55555555-5555-4555-8555-55555555555${index}`,
          createdAt: timestamp,
          ...item,
        })),
      });
    },
  });

  const result = await createMeal(userId, mealInput(), db);
  const rows = createQuery.data.items.create;

  assert.equal(createQuery.data.userId, userId);
  assert.equal(Number(rows[0].calories), 330);
  assert.equal(Number(rows[0].proteinGrams), 62);
  assert.equal(Number(rows[1].calories), 345);
  assert.equal(Number(rows[1].proteinGrams), 48.53);
  assert.equal(rows[2].proteinGrams, null);
  assert.deepEqual(rows.map((row) => row.orderIndex), [0, 1, 2]);
  assert.equal(result.totals.calories, 975);
  assert.equal(result.totals.proteinGrams, null);
  assert.equal(result.totals.macrosComplete, false);
});

test("meal creation batches privacy-scoped source lookups", async () => {
  let foodQuery;
  let recipeQuery;
  const db = {
    food: {
      async findMany(args) {
        foodQuery = args;
        return [food];
      },
    },
    recipe: {
      async findMany(args) {
        recipeQuery = args;
        return [recipe];
      },
    },
    meal: {
      async create(args) {
        return mealRecord({
          items: args.data.items.create.map((item, index) => ({
            id: `55555555-5555-4555-8555-55555555555${index}`,
            createdAt: timestamp,
            ...item,
          })),
        });
      },
    },
  };

  await createMeal(userId, mealInput(), db);

  assert.deepEqual(foodQuery.where.OR, [
    { createdByUserId: null },
    { createdByUserId: userId },
  ]);
  assert.deepEqual(recipeQuery.where.OR, [
    { createdByUserId: null },
    { createdByUserId: userId },
  ]);
  assert.deepEqual(foodQuery.where.id.in, [foodId]);
  assert.deepEqual(recipeQuery.where.id.in, [recipeId]);
});

test("unavailable catalog sources fail before a meal is written", async () => {
  let createCalled = false;
  const db = {
    food: { async findMany() { return []; } },
    recipe: { async findMany() { return [recipe]; } },
    meal: {
      async create() {
        createCalled = true;
      },
    },
  };

  await assert.rejects(
    createMeal(userId, mealInput(), db),
    (error) =>
      error.code === "INVALID_MEAL_ITEMS" &&
      error.statusCode === 409
  );
  assert.equal(createCalled, false);
});

test("future meals are rejected before any database lookup", async () => {
  let queried = false;
  const db = {
    food: { async findMany() { queried = true; } },
    recipe: { async findMany() { queried = true; } },
  };

  await assert.rejects(
    createMeal(
      userId,
      mealInput({
        occurredAt: new Date(Date.now() + 10 * 60 * 1000),
      }),
      db
    ),
    (error) => error.code === "INVALID_MEAL_TIME"
  );
  assert.equal(queried, false);
});

test("meal lists are owner-scoped, paginated, and date-filtered in user time", async () => {
  let findQuery;
  let countQuery;
  const db = {
    meal: {
      async findMany(args) {
        findQuery = args;
        return [mealRecord()];
      },
      async count(args) {
        countQuery = args;
        return 21;
      },
    },
  };

  const result = await listMeals(
    userId,
    { date: "2026-08-31", page: 2, limit: 10 },
    "UTC",
    db
  );

  assert.equal(findQuery.where.userId, userId);
  assert.equal(
    findQuery.where.occurredAt.gte.toISOString(),
    "2026-08-31T00:00:00.000Z"
  );
  assert.equal(
    findQuery.where.occurredAt.lt.toISOString(),
    "2026-09-01T00:00:00.000Z"
  );
  assert.deepEqual(countQuery.where, findQuery.where);
  assert.equal(findQuery.skip, 10);
  assert.equal(result.pagination.totalPages, 3);
});

test("date filtering requires the user's timezone", async () => {
  await assert.rejects(
    listMeals(
      userId,
      { date: "2026-08-31", page: 1, limit: 20 },
      null,
      {}
    ),
    (error) => error.code === "MEAL_TIMEZONE_REQUIRED"
  );
});

test("meal details expose snapshots but never user ownership data", async () => {
  const db = {
    meal: { async findFirst() { return mealRecord(); } },
  };

  const result = await getMealById(userId, mealId, db);

  assert.equal(result.items[0].itemName, "Chicken breast");
  assert.equal(result.totals.calories, 330);
  assert.equal("userId" in result, false);
});

test("another user's meal is indistinguishable from a missing meal", async () => {
  const db = {
    meal: { async findFirst() { return null; } },
  };

  await assert.rejects(
    getMealById(userId, mealId, db),
    (error) =>
      error.code === "MEAL_NOT_FOUND" && error.statusCode === 404
  );
});

test("meal replacement is owner-only and atomically replaces snapshots", async () => {
  let updateQuery;
  let deleteQuery;
  let createdRows;
  const tx = {
    meal: {
      async updateMany(args) {
        updateQuery = args;
        return { count: 1 };
      },
      async findUnique() {
        return mealRecord();
      },
    },
    mealItem: {
      async deleteMany(args) {
        deleteQuery = args;
      },
      async createMany({ data }) {
        createdRows = data;
      },
    },
  };
  const db = {
    ...sourceDb({
      async findFirst() {
        return { id: mealId };
      },
    }),
    async $transaction(callback) {
      return callback(tx);
    },
  };

  await replaceMeal(userId, mealId, mealInput(), db);

  assert.deepEqual(updateQuery.where, { id: mealId, userId });
  assert.deepEqual(deleteQuery.where, { mealId });
  assert.equal(createdRows.length, 3);
  assert.equal(createdRows[0].mealId, mealId);
});

test("unowned meals cannot be replaced or deleted", async () => {
  const replaceDb = {
    meal: { async findFirst() { return null; } },
  };
  const deleteDb = {
    meal: { async deleteMany() { return { count: 0 }; } },
  };

  await assert.rejects(
    replaceMeal(userId, mealId, mealInput(), replaceDb),
    (error) => error.code === "MEAL_NOT_FOUND"
  );
  await assert.rejects(
    deleteMeal(userId, mealId, deleteDb),
    (error) => error.code === "MEAL_NOT_FOUND"
  );
});

test("meal deletion is hard, owner-scoped, and relies on item cascade", async () => {
  let deleteQuery;
  const db = {
    meal: {
      async deleteMany(args) {
        deleteQuery = args;
        return { count: 1 };
      },
    },
  };

  await deleteMeal(userId, mealId, db);
  assert.deepEqual(deleteQuery.where, { id: mealId, userId });
});
