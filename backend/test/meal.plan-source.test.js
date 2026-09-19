import assert from "node:assert/strict";
import { test } from "node:test";

Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://spotter:spotter@localhost:5432/spotter_test",
  FRONTEND_URL: "http://localhost:5173",
  ACCESS_TOKEN_SECRET: Buffer.alloc(32, 1).toString("base64url"),
  EMAIL_USER: "test@example.com",
  EMAIL_APP_PASSWORD: "test-password",
  CLOUD_NAME: "test",
  CLOUD_API_KEY: "test",
  CLOUD_API_SECRET: "test",
  GROQ_API_KEY: "test",
  GROQ_MODEL_NAME: "test",
});

const { createMeal, logMealFromPlan } = await import(
  "../src/modules/meals/meal.service.js"
);
const { createMealSchema, logMealFromPlanSchema } = await import(
  "../src/modules/meals/meal.validate.js"
);

const userId = "11111111-1111-4111-8111-111111111111";
const foodId = "22222222-2222-4222-8222-222222222222";
const planDayId = "33333333-3333-4333-8333-333333333333";
const optionId = "44444444-4444-4444-8444-444444444444";

function mockPlanDay(planOverrides = {}, dayOverrides = {}) {
  return {
    id: planDayId,
    breakfastOptions: [{ id: optionId, label: "Oatmeal Bowl", items: [] }],
    lunchOptions: null,
    dinnerOptions: null,
    snackOptions: null,
    plan: {
      id: "plan-1",
      userId,
      startDate: new Date("2026-10-01T00:00:00Z"),
      endDate: new Date("2026-10-31T00:00:00Z"),
      ...planOverrides,
    },
    ...dayOverrides,
  };
}

function baseMealInput(overrides = {}) {
  return {
    mealType: "BREAKFAST",
    occurredAt: new Date(Date.now() - 60000),
    notes: "Post workout meal",
    items: [{ itemType: "FOOD", foodId, quantityGrams: 150 }],
    ...overrides,
  };
}

test("createMealSchema validates planSource shape", () => {
  const valid = createMealSchema.safeParse({
    mealType: "BREAKFAST",
    occurredAt: new Date().toISOString(),
    items: [{ itemType: "FOOD", foodId, quantityGrams: 100 }],
    planSource: {
      planDayId,
      optionId,
      scheduledDate: "2026-10-05",
    },
  });
  assert.equal(valid.success, true);
  assert.equal(valid.data.planSource.planDayId, planDayId);

  const invalidDate = createMealSchema.safeParse({
    mealType: "BREAKFAST",
    occurredAt: new Date().toISOString(),
    items: [{ itemType: "FOOD", foodId, quantityGrams: 100 }],
    planSource: {
      planDayId,
      optionId,
      scheduledDate: "bad-date",
    },
  });
  assert.equal(invalidDate.success, false);
});

test("createMeal rejects if planDay does not exist or user is not owner", async () => {
  const mockDb = {
    planDay: { findFirst: async () => null },
    food: { findMany: async () => [{ id: foodId, nameEn: "Egg", caloriesPer100g: 140 }] },
    recipe: { findMany: async () => [] },
  };

  const input = baseMealInput({
    planSource: { planDayId, optionId, scheduledDate: "2026-10-05" },
  });

  await assert.rejects(
    () => createMeal(userId, input, mockDb),
    { code: "PLAN_NOT_FOUND" }
  );
});

test("createMeal rejects if scheduledDate falls outside plan coverage", async () => {
  const mockDb = {
    planDay: { findFirst: async () => mockPlanDay() },
    food: { findMany: async () => [{ id: foodId, nameEn: "Egg", caloriesPer100g: 140 }] },
    recipe: { findMany: async () => [] },
  };

  const input = baseMealInput({
    planSource: { planDayId, optionId, scheduledDate: "2026-11-15" },
  });

  await assert.rejects(
    () => createMeal(userId, input, mockDb),
    { code: "PLAN_SCHEDULE_MISMATCH" }
  );
});

test("createMeal rejects if optionId does not exist in planDay", async () => {
  const mockDb = {
    planDay: { findFirst: async () => mockPlanDay() },
    food: { findMany: async () => [{ id: foodId, nameEn: "Egg", caloriesPer100g: 140 }] },
    recipe: { findMany: async () => [] },
  };

  const input = baseMealInput({
    planSource: { planDayId, optionId: "99999999-9999-9999-9999-999999999999", scheduledDate: "2026-10-05" },
  });

  await assert.rejects(
    () => createMeal(userId, input, mockDb),
    { code: "PLAN_NOT_FOUND" }
  );
});

test("createMeal records planSource attributes upon creation", async () => {
  let createdMealData = null;
  const mockDb = {
    planDay: { findFirst: async () => mockPlanDay() },
    food: {
      findMany: async () => [{
        id: foodId,
        nameEn: "Egg",
        caloriesPer100g: 140,
        proteinGramsPer100g: 12,
        carbohydrateGramsPer100g: 1,
        fatGramsPer100g: 10,
      }],
    },
    recipe: { findMany: async () => [] },
    meal: {
      create: async ({ data }) => {
        createdMealData = data;
        return {
          id: "meal-1",
          mealType: data.mealType,
          occurredAt: data.occurredAt,
          notes: data.notes,
          sourcePlanDayId: data.sourcePlanDayId,
          sourceMealOptionId: data.sourceMealOptionId,
          scheduledDate: data.scheduledDate,
          items: [{
            id: "mi-1",
            itemType: "FOOD",
            foodId,
            recipeId: null,
            itemName: "Egg",
            orderIndex: 0,
            quantityGrams: 150,
            servings: null,
            calories: 210,
            proteinGrams: 18,
            carbohydrateGrams: 1.5,
            fatGrams: 15,
            createdAt: new Date(),
          }],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
    },
  };

  const input = baseMealInput({
    planSource: { planDayId, optionId, scheduledDate: "2026-10-05" },
  });

  const meal = await createMeal(userId, input, mockDb);

  assert.equal(meal.id, "meal-1");
  assert.equal(meal.sourcePlanDayId, planDayId);
  assert.equal(meal.sourceMealOptionId, optionId);
  assert.equal(meal.scheduledDate, "2026-10-05");
  assert.equal(createdMealData.sourcePlanDayId, planDayId);
  assert.equal(createdMealData.sourceMealOptionId, optionId);
});

test("logMealFromPlanSchema validates required and optional fields", () => {
  const validMin = logMealFromPlanSchema.safeParse({
    planDayId,
    optionId,
    scheduledDate: "2026-10-05",
  });
  assert.equal(validMin.success, true);
  assert.equal(validMin.data.planDayId, planDayId);
  assert.equal(validMin.data.mealType, undefined);

  const validFull = logMealFromPlanSchema.safeParse({
    planDayId,
    optionId,
    scheduledDate: "2026-10-05",
    mealType: "LUNCH",
    notes: "Ate after cycling",
    items: [{ itemType: "FOOD", foodId, quantityGrams: 200 }],
  });
  assert.equal(validFull.success, true);
  assert.equal(validFull.data.mealType, "LUNCH");

  const invalid = logMealFromPlanSchema.safeParse({
    planDayId: "not-a-uuid",
    optionId,
    scheduledDate: "2026-10-05",
  });
  assert.equal(invalid.success, false);
});

test("logMealFromPlan auto-extracts items and infers mealType from option slot", async () => {
  let createdMealData = null;
  const mockDb = {
    planDay: {
      findFirst: async () => ({
        id: planDayId,
        breakfastOptions: null,
        lunchOptions: [
          {
            id: optionId,
            label: "Chicken & Rice",
            items: [{ itemType: "FOOD", foodId, quantityGrams: 200 }],
          },
        ],
        dinnerOptions: null,
        snackOptions: null,
        plan: {
          id: "plan-1",
          userId,
          startDate: new Date("2026-10-01T00:00:00Z"),
          endDate: new Date("2026-10-31T00:00:00Z"),
        },
      }),
    },
    food: {
      findMany: async () => [
        {
          id: foodId,
          nameEn: "Rice",
          caloriesPer100g: 130,
          proteinGramsPer100g: 2.7,
          carbohydrateGramsPer100g: 28,
          fatGramsPer100g: 0.3,
        },
      ],
    },
    recipe: { findMany: async () => [] },
    meal: {
      create: async ({ data }) => {
        createdMealData = data;
        return {
          id: "meal-plan-1",
          mealType: data.mealType,
          occurredAt: data.occurredAt,
          notes: data.notes,
          sourcePlanDayId: data.sourcePlanDayId,
          sourceMealOptionId: data.sourceMealOptionId,
          scheduledDate: data.scheduledDate,
          items: [
            {
              id: "mi-1",
              itemType: "FOOD",
              foodId,
              recipeId: null,
              itemName: "Rice",
              orderIndex: 0,
              quantityGrams: 200,
              servings: null,
              calories: 260,
              proteinGrams: 5.4,
              carbohydrateGrams: 56,
              fatGrams: 0.6,
              createdAt: new Date(),
            },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
    },
  };

  const meal = await logMealFromPlan(
    userId,
    {
      planDayId,
      optionId,
      scheduledDate: "2026-10-05",
    },
    mockDb
  );

  assert.equal(meal.id, "meal-plan-1");
  assert.equal(meal.mealType, "LUNCH"); // Inferred from lunchOptions
  assert.equal(meal.sourcePlanDayId, planDayId);
  assert.equal(meal.sourceMealOptionId, optionId);
  assert.equal(meal.scheduledDate, "2026-10-05");
  assert.equal(meal.items.length, 1);
  assert.equal(meal.items[0].itemName, "Rice");
  assert.equal(createdMealData.mealType, "LUNCH");
});

test("logMealFromPlan allows overriding mealType and items", async () => {
  let createdMealData = null;
  const customFoodId = "55555555-5555-5555-5555-555555555555";
  const mockDb = {
    planDay: {
      findFirst: async () => ({
        id: planDayId,
        breakfastOptions: [
          {
            id: optionId,
            label: "Pancakes",
            items: [{ itemType: "FOOD", foodId, quantityGrams: 100 }],
          },
        ],
        lunchOptions: null,
        dinnerOptions: null,
        snackOptions: null,
        plan: {
          id: "plan-1",
          userId,
          startDate: new Date("2026-10-01T00:00:00Z"),
          endDate: new Date("2026-10-31T00:00:00Z"),
        },
      }),
    },
    food: {
      findMany: async () => [
        {
          id: customFoodId,
          nameEn: "Oats",
          caloriesPer100g: 389,
          proteinGramsPer100g: 16.9,
          carbohydrateGramsPer100g: 66.3,
          fatGramsPer100g: 6.9,
        },
      ],
    },
    recipe: { findMany: async () => [] },
    meal: {
      create: async ({ data }) => {
        createdMealData = data;
        return {
          id: "meal-plan-2",
          mealType: data.mealType,
          occurredAt: data.occurredAt,
          notes: data.notes,
          sourcePlanDayId: data.sourcePlanDayId,
          sourceMealOptionId: data.sourceMealOptionId,
          scheduledDate: data.scheduledDate,
          items: [
            {
              id: "mi-2",
              itemType: "FOOD",
              foodId: customFoodId,
              recipeId: null,
              itemName: "Oats",
              orderIndex: 0,
              quantityGrams: 80,
              servings: null,
              calories: 311.2,
              proteinGrams: 13.52,
              carbohydrateGrams: 53.04,
              fatGrams: 5.52,
              createdAt: new Date(),
            },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
    },
  };

  const meal = await logMealFromPlan(
    userId,
    {
      planDayId,
      optionId,
      scheduledDate: "2026-10-05",
      mealType: "SNACK", // Overrides breakfast
      notes: "Quick morning snack",
      items: [{ itemType: "FOOD", foodId: customFoodId, quantityGrams: 80 }],
    },
    mockDb
  );

  assert.equal(meal.mealType, "SNACK");
  assert.equal(meal.notes, "Quick morning snack");
  assert.equal(meal.items[0].foodId, customFoodId);
  assert.equal(createdMealData.mealType, "SNACK");
  assert.equal(createdMealData.notes, "Quick morning snack");
});
