import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createCustomFoodSchema,
  getFoodsQuerySchema,
} from "../src/modules/foods/food.validate.js";

function validFood(overrides = {}) {
  return {
    nameEn: "Greek yogurt",
    nameAr: "زبادي يوناني",
    category: "Dairy",
    caloriesPer100g: 97,
    proteinGramsPer100g: 9,
    carbohydrateGramsPer100g: 3.9,
    fatGramsPer100g: 5,
    ...overrides,
  };
}

test("custom food accepts canonical nutrition per 100 grams", () => {
  const result = createCustomFoodSchema.safeParse(validFood());

  assert.equal(result.success, true);
  assert.equal(result.data.nameEn, "Greek yogurt");
});

test("custom food trims its names and category", () => {
  const result = createCustomFoodSchema.safeParse(
    validFood({ nameEn: "  Greek yogurt  ", category: "  Dairy  " })
  );

  assert.equal(result.success, true);
  assert.equal(result.data.nameEn, "Greek yogurt");
  assert.equal(result.data.category, "Dairy");
});

test("custom food rejects ownership and catalog-controlled fields", () => {
  const result = createCustomFoodSchema.safeParse(
    validFood({
      createdByUserId: "11111111-1111-4111-8111-111111111111",
      source: "user-request",
      isActive: false,
    })
  );

  assert.equal(result.success, false);
  assert.equal(result.error.issues[0].code, "unrecognized_keys");
});

test("custom food rejects negative nutrition", () => {
  const result = createCustomFoodSchema.safeParse(
    validFood({ caloriesPer100g: -1 })
  );

  assert.equal(result.success, false);
  assert.ok(
    result.error.issues.some(
      (issue) => issue.path.join(".") === "caloriesPer100g"
    )
  );
});

test("a macro cannot exceed 100 grams per 100 grams of food", () => {
  const result = createCustomFoodSchema.safeParse(
    validFood({ proteinGramsPer100g: 101 })
  );

  assert.equal(result.success, false);
});

test("food search query converts page and limit from URL strings", () => {
  const result = getFoodsQuerySchema.safeParse({
    search: "  chicken  ",
    category: "Protein",
    page: "2",
    limit: "10",
  });

  assert.equal(result.success, true);
  assert.deepEqual(result.data, {
    search: "chicken",
    category: "Protein",
    page: 2,
    limit: 10,
  });
});

test("food search query supplies safe pagination defaults", () => {
  const result = getFoodsQuerySchema.safeParse({ search: "rice" });

  assert.equal(result.success, true);
  assert.equal(result.data.page, 1);
  assert.equal(result.data.limit, 20);
});

test("food search query rejects invalid pages, oversized limits, and unknown fields", () => {
  assert.equal(
    getFoodsQuerySchema.safeParse({ search: "rice", page: "0" }).success,
    false
  );
  assert.equal(
    getFoodsQuerySchema.safeParse({ search: "rice", limit: "51" }).success,
    false
  );
  assert.equal(
    getFoodsQuerySchema.safeParse({ search: "rice", ownerId: "someone" })
      .success,
    false
  );
});
