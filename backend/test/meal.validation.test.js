import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createMealSchema,
  listMealsQuerySchema,
  mealIdParamSchema,
} from "../src/modules/meals/meal.validate.js";

const foodId = "11111111-1111-4111-8111-111111111111";
const recipeId = "22222222-2222-4222-8222-222222222222";

function validMeal(overrides = {}) {
  return {
    mealType: "LUNCH",
    occurredAt: "2026-09-01T13:30:00+03:00",
    notes: "After training",
    items: [
      { itemType: "FOOD", foodId, quantityGrams: 200 },
      { itemType: "RECIPE", recipeId, servings: 1.5 },
      { itemType: "QUICK", calories: 250 },
    ],
    ...overrides,
  };
}

test("meal creation accepts mixed items and normalizes the timestamp", () => {
  const result = createMealSchema.safeParse(validMeal());

  assert.equal(result.success, true);
  assert.ok(result.data.occurredAt instanceof Date);
  assert.equal(result.data.items[2].itemName, "Quick add");
  assert.equal(result.data.items[2].proteinGrams, null);
});

test("food and recipe nutrition cannot be controlled by the client", () => {
  const result = createMealSchema.safeParse(
    validMeal({
      items: [
        {
          itemType: "FOOD",
          foodId,
          quantityGrams: 200,
          calories: 1,
        },
      ],
    })
  );

  assert.equal(result.success, false);
  assert.equal(result.error.issues[0].code, "unrecognized_keys");
});

test("quick add requires calories and accepts optional macros", () => {
  const valid = createMealSchema.safeParse(
    validMeal({
      items: [
        {
          itemType: "QUICK",
          itemName: "Cafe drink",
          calories: 180,
          proteinGrams: 7,
          carbohydrateGrams: 20,
          fatGrams: 5,
        },
      ],
    })
  );
  const missingCalories = createMealSchema.safeParse(
    validMeal({
      items: [{ itemType: "QUICK", itemName: "Unknown" }],
    })
  );

  assert.equal(valid.success, true);
  assert.equal(missingCalories.success, false);
});

test("meal items reject invalid type-specific fields", () => {
  const result = createMealSchema.safeParse(
    validMeal({
      items: [
        {
          itemType: "RECIPE",
          recipeId,
          servings: 1,
          quantityGrams: 100,
        },
      ],
    })
  );

  assert.equal(result.success, false);
});

test("duplicate catalog items must be combined", () => {
  const result = createMealSchema.safeParse(
    validMeal({
      items: [
        { itemType: "FOOD", foodId, quantityGrams: 100 },
        { itemType: "FOOD", foodId, quantityGrams: 50 },
      ],
    })
  );

  assert.equal(result.success, false);
  assert.ok(
    result.error.issues.some(
      (issue) => issue.path.join(".") === "items"
    )
  );
});

test("meal list query validates real dates and coerces pagination", () => {
  const result = listMealsQuerySchema.safeParse({
    date: "2026-08-31",
    page: "2",
    limit: "10",
  });
  const impossibleDate = listMealsQuerySchema.safeParse({
    date: "2026-02-30",
  });

  assert.deepEqual(result.data, {
    date: "2026-08-31",
    page: 2,
    limit: 10,
  });
  assert.equal(impossibleDate.success, false);
});

test("meal IDs and top-level client ownership fields are rejected", () => {
  assert.equal(
    mealIdParamSchema.safeParse({ mealId: "not-a-uuid" }).success,
    false
  );
  assert.equal(
    createMealSchema.safeParse(
      validMeal({ userId: foodId })
    ).success,
    false
  );
});
