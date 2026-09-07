import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createRecipeSchema,
  deleteRecipeSchema,
  recipeIdParamSchema,
  searchRecipesQuerySchema,
} from "../src/modules/recipes/recipe.validate.js";

const foodId = "11111111-1111-4111-8111-111111111111";

function validRecipe(overrides = {}) {
  return {
    nameEn: "Chicken rice bowl",
    nameAr: "طبق دجاج وأرز",
    servings: 2,
    countryCode: "eg",
    cuisine: "Egyptian",
    instructions: "Cook and serve.",
    ingredients: [{ foodId, quantityGrams: 300 }],
    ...overrides,
  };
}

test("recipe creation accepts a complete recipe and normalizes text", () => {
  const result = createRecipeSchema.safeParse(
    validRecipe({
      nameEn: "  Chicken rice bowl  ",
      countryCode: "eg",
    })
  );

  assert.equal(result.success, true);
  assert.equal(result.data.nameEn, "Chicken rice bowl");
  assert.equal(result.data.countryCode, "EG");
});

test("recipe creation requires at least one ingredient", () => {
  const result = createRecipeSchema.safeParse(
    validRecipe({ ingredients: [] })
  );

  assert.equal(result.success, false);
  assert.ok(
    result.error.issues.some(
      (issue) => issue.path.join(".") === "ingredients"
    )
  );
});

test("recipe creation rejects duplicate foods", () => {
  const result = createRecipeSchema.safeParse(
    validRecipe({
      ingredients: [
        { foodId, quantityGrams: 100 },
        { foodId, quantityGrams: 50 },
      ],
    })
  );

  assert.equal(result.success, false);
});

test("recipe creation rejects client-controlled ownership and nutrition", () => {
  const result = createRecipeSchema.safeParse(
    validRecipe({
      createdByUserId: "22222222-2222-4222-8222-222222222222",
      caloriesPerServing: 1,
      source: "external",
    })
  );

  assert.equal(result.success, false);
  assert.equal(result.error.issues[0].code, "unrecognized_keys");
});

test("recipe search query coerces pagination and normalizes country", () => {
  const result = searchRecipesQuerySchema.safeParse({
    search: "  chicken  ",
    countryCode: "eg",
    page: "2",
    limit: "10",
  });

  assert.equal(result.success, true);
  assert.deepEqual(result.data, {
    search: "chicken",
    countryCode: "EG",
    page: 2,
    limit: 10,
  });
});

test("recipe IDs and delete password confirmation are validated", () => {
  assert.equal(
    recipeIdParamSchema.safeParse({ recipeId: "not-a-uuid" }).success,
    false
  );
  assert.equal(deleteRecipeSchema.safeParse({}).success, false);
  assert.equal(
    deleteRecipeSchema.safeParse({ password: "current-password" }).success,
    true
  );
});
