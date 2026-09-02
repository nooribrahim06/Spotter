import assert from "node:assert/strict";
import { test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  "postgresql://spotter:spotter@localhost:5432/spotter_test";

const { createCustomFood, getFoodOverview, searchFood } = await import(
  "../src/modules/foods/food.service.js"
);

const userId = "11111111-1111-4111-8111-111111111111";
const foodId = "22222222-2222-4222-8222-222222222222";
const timestamp = new Date("2026-09-02T08:00:00.000Z");

function foodRecord(overrides = {}) {
  return {
    id: foodId,
    nameEn: "Greek yogurt",
    nameAr: null,
    aliases: null,
    category: "Dairy",
    caloriesPer100g: "97.00",
    proteinGramsPer100g: "9.00",
    carbohydrateGramsPer100g: "3.90",
    fatGramsPer100g: "5.00",
    createdByUserId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

test("food overview contains recent and user-created foods only", async () => {
  let recentQuery;
  let customQuery;
  const db = {
    mealItem: {
      async findMany(args) {
        recentQuery = args;
        return [{ food: foodRecord() }];
      },
    },
    food: {
      async findMany(args) {
        customQuery = args;
        return [
          foodRecord({
            id: "33333333-3333-4333-8333-333333333333",
            nameEn: "My oats",
            createdByUserId: userId,
          }),
        ];
      },
    },
  };

  const result = await getFoodOverview(userId, db);

  assert.deepEqual(recentQuery.where, {
    itemType: "FOOD",
    foodId: { not: null },
    meal: { userId },
    food: {
      is: {
        isActive: true,
        OR: [{ createdByUserId: null }, { createdByUserId: userId }],
      },
    },
  });
  assert.deepEqual(recentQuery.distinct, ["foodId"]);
  assert.equal(recentQuery.take, 10);
  assert.deepEqual(customQuery.where, {
    createdByUserId: userId,
    isActive: true,
  });
  assert.equal(customQuery.take, 20);
  assert.equal(result.recentFoods.length, 1);
  assert.equal(result.recentFoods[0].isCustom, false);
  assert.equal(result.customFoods.length, 1);
  assert.equal(result.customFoods[0].isCustom, true);
  assert.equal("createdByUserId" in result.customFoods[0], false);
});

test("custom food ownership comes only from authentication", async () => {
  let createQuery;
  const db = {
    food: {
      async create(args) {
        createQuery = args;
        return foodRecord({
          ...args.data,
          createdByUserId: args.data.createdByUserId,
        });
      },
    },
  };

  const result = await createCustomFood(
    userId,
    {
      nameEn: "Greek yogurt",
      nameAr: null,
      category: "Dairy",
      caloriesPer100g: 97,
      proteinGramsPer100g: 9,
      carbohydrateGramsPer100g: 3.9,
      fatGramsPer100g: 5,
      createdByUserId: "99999999-9999-4999-8999-999999999999",
      source: "external",
      isActive: false,
    },
    db
  );

  assert.equal(createQuery.data.createdByUserId, userId);
  assert.equal("source" in createQuery.data, false);
  assert.equal("isActive" in createQuery.data, false);
  assert.equal(result.isCustom, true);
  assert.equal("createdByUserId" in result, false);
});

test("food search filters accessible foods and returns pagination metadata", async () => {
  let findQuery;
  let countQuery;
  const db = {
    food: {
      async findMany(args) {
        findQuery = args;
        return [foodRecord()];
      },
      async count(args) {
        countQuery = args;
        return 21;
      },
    },
  };

  const result = await searchFood(
    userId,
    {
      search: "chicken",
      category: "Protein",
      page: 2,
      limit: 10,
    },
    db
  );

  assert.deepEqual(findQuery.where, {
    isActive: true,
    AND: [
      {
        OR: [
          { createdByUserId: null },
          { createdByUserId: userId },
        ],
      },
      {
        OR: [
          {
            nameEn: {
              contains: "chicken",
              mode: "insensitive",
            },
          },
          {
            nameAr: {
              contains: "chicken",
              mode: "insensitive",
            },
          },
        ],
      },
      { category: "Protein" },
    ],
  });
  assert.deepEqual(countQuery.where, findQuery.where);
  assert.deepEqual(findQuery.orderBy, [
    { nameEn: "asc" },
    { id: "asc" },
  ]);
  assert.equal(findQuery.skip, 10);
  assert.equal(findQuery.take, 10);
  assert.equal(result.items[0].caloriesPer100g, 97);
  assert.deepEqual(result.pagination, {
    page: 2,
    limit: 10,
    totalItems: 21,
    totalPages: 3,
    hasPreviousPage: true,
    hasNextPage: true,
  });
});

test("food search reports an empty final page correctly", async () => {
  const db = {
    food: {
      async findMany() {
        return [];
      },
      async count() {
        return 0;
      },
    },
  };

  const result = await searchFood(
    userId,
    {
      search: "missing",
      category: undefined,
      page: 1,
      limit: 20,
    },
    db
  );

  assert.deepEqual(result.items, []);
  assert.deepEqual(result.pagination, {
    page: 1,
    limit: 20,
    totalItems: 0,
    totalPages: 0,
    hasPreviousPage: false,
    hasNextPage: false,
  });
});
