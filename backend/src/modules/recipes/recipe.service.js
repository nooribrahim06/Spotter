import {
  InvalidRecipeIngredientsError,
  RecipeNotFoundError,
} from "../../middlewares/errorHandling.js";
import * as recipeRepository from "./recipe.repository.js";
import { calculateRecipeNutrition } from "./recipe.rules.js";
import {
  serializeRecipeDetails,
  serializeRecipeSummary,
} from "./recipe.serializer.js";

function buildRecipeData(input, totals) {
  return {
    nameEn: input.nameEn,
    nameAr: input.nameAr ?? null,
    servings: totals.servings,
    totalYieldGrams: totals.totalYieldGrams,
    caloriesPerServing: totals.caloriesPerServing,
    proteinGramsPerServing: totals.proteinGramsPerServing,
    carbohydrateGramsPerServing:
      totals.carbohydrateGramsPerServing,
    fatGramsPerServing: totals.fatGramsPerServing,
    countryCode: input.countryCode ?? null,
    cuisine: input.cuisine ?? null,
    instructions: input.instructions ?? null,
  };
}

async function prepareRecipe(userId, input, db) {
  const foodIds = input.ingredients.map((ingredient) => ingredient.foodId);
  const foods = await recipeRepository.findAccessibleIngredientFoods(
    userId,
    foodIds,
    db
  );

  if (foods.length !== foodIds.length) {
    throw new InvalidRecipeIngredientsError();
  }

  return calculateRecipeNutrition(
    input.ingredients,
    foods,
    input.servings
  );
}

export async function searchRecipes(userId, query, db) {
  const { recipes, totalItems } = await recipeRepository.searchRecipes(
    userId,
    query,
    db
  );
  const totalPages = Math.ceil(totalItems / query.limit);

  return {
    items: recipes.map((recipe) =>
      serializeRecipeSummary(recipe, userId)
    ),
    pagination: {
      page: query.page,
      limit: query.limit,
      totalItems,
      totalPages,
      hasPreviousPage: query.page > 1,
      hasNextPage: query.page < totalPages,
    },
  };
}

export async function getRecipeById(userId, recipeId, db) {
  const recipe = await recipeRepository.findVisibleRecipeById(
    recipeId,
    userId,
    db
  );
  if (!recipe) throw new RecipeNotFoundError();

  return serializeRecipeDetails(recipe, userId);
}

export async function createRecipe(userId, input, db) {
  const { ingredientRows, totals } = await prepareRecipe(
    userId,
    input,
    db
  );
  const recipe = await recipeRepository.createRecipe(
    userId,
    buildRecipeData(input, totals),
    ingredientRows,
    db
  );

  return serializeRecipeDetails(recipe, userId);
}

export async function replaceRecipe(userId, recipeId, input, db) {
  const ownedRecipe = await recipeRepository.findOwnedActiveRecipe(
    recipeId,
    userId,
    db
  );
  if (!ownedRecipe) throw new RecipeNotFoundError();

  const { ingredientRows, totals } = await prepareRecipe(
    userId,
    input,
    db
  );
  const recipe = await recipeRepository.replaceOwnedRecipe(
    recipeId,
    userId,
    buildRecipeData(input, totals),
    ingredientRows,
    db
  );
  if (!recipe) throw new RecipeNotFoundError();

  return serializeRecipeDetails(recipe, userId);
}

export async function deleteRecipe(userId, recipeId, db) {
  const archived = await recipeRepository.archiveOwnedRecipe(
    recipeId,
    userId,
    db
  );
  if (!archived) throw new RecipeNotFoundError();
}
