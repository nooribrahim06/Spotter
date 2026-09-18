import { Buffer } from "node:buffer";
import { z } from "zod";
import {
  InvalidAccessTokenError,
  PlanContextIncompleteError,
  PlanNotEligibleError,
} from "../../../middlewares/errorHandling.js";
import { createPublicErrorDetails } from "../../../middlewares/validatebody.js";
import * as exerciseRepository from "../../exercises/exercise.repository.js";
import * as foodRepository from "../../foods/food.repository.js";
import * as recipeRepository from "../../recipes/recipe.repository.js";
import { evaluatePlanReadiness, getAllowedPlanEquipment } from "../plan.rules.js";
import {
  PLAN_TOOL_LIMITS,
  PLAN_CATALOG_TOOL_NAME,
  searchPlanCatalogToolSchema,
  getPlanToolDefinitions,
} from "./plan.tools.schema.js";

function failure(code, message, details = null) {
  return { ok: false, error: { code, message, details } };
}

function pagination(query, totalItems) {
  return {
    page: query.page,
    limit: query.limit,
    hasNextPage: query.page * query.limit < totalItems,
  };
}

function foodCandidate(food) {
  // Explicit fields keep owner IDs, audit timestamps, and unrelated metadata
  // out of model input. Database Decimal values become JSON numbers.
  return {
    id: food.id,
    nameEn: food.nameEn,
    nameAr: food.nameAr,
    category: food.category,
    caloriesPer100g: Number(food.caloriesPer100g),
    proteinGramsPer100g: Number(food.proteinGramsPer100g),
    carbohydrateGramsPer100g: Number(food.carbohydrateGramsPer100g),
    fatGramsPer100g: Number(food.fatGramsPer100g),
  };
}

/**
 * Create ONE tool session per generation, after loading authoritative context.
 *
 * userId comes from authentication; source comes from plan.repository.js.
 * Neither comes from model arguments. No new public HTTP routes are needed.
 *
 * Future adapter usage:
 *   const tools = createPlanTools({ userId, source, db });
 *   // Send tools.definitions to the model through the provider adapter.
 *   const output = await tools.execute(toolCall.name, toolCall.arguments);
 *   // Stop on !output.ok. Otherwise pass output.results to
 *   // buildPlanGenerationPrompt({ context, toolResults: output.results }).
 *   // Request 2 is a fresh generation request with tools disabled.
 *
 * The tools only retrieve candidates. The generation service must validate
 * the final selections, nutrition, schedule, and restrictions before saving.
 */
export function createPlanTools({ userId, source, db }) {
  // re check the user is redundant because the userID is already sent from 
  // authentication middleware, but we still check the source to ensure the user is still valid
  const readiness = evaluatePlanReadiness(source);
  if (readiness.blocked) throw new PlanNotEligibleError(readiness);
  if (!readiness.ready) throw new PlanContextIncompleteError(readiness);

  // Capture the shared equipment policy once for database search constraints.
  const allowedEquipment = getAllowedPlanEquipment(source.trainingProfile);

  let batchAttempted = false; // One AI tool round per generation, including failures.
  const handlers = new Map([
    ["searchExercises", {
      async run(query) {
        const { exercises, totalItems } = await exerciseRepository.findExercises(
          query, db, { allowedEquipment }
        );
        return {
          items: exercises.map((exercise) => ({
            id: exercise.id,
            name: exercise.name,
            exerciseType: exercise.exerciseType,
            bodyPart: exercise.bodyPart,
            difficulty: exercise.difficulty,
            force: exercise.force,
            mechanic: exercise.mechanic,
            equipment: exercise.equipment,
            primaryMuscles: exercise.primaryMuscles,
            secondaryMuscles: exercise.secondaryMuscles,
            trackingMetrics: exercise.trackingMetrics,
          })),
          pagination: pagination(query, totalItems),
          appliedConstraints: { allowedEquipment },
          restrictionValidation: "NOT_VERIFIED",
        };
      },
    }],
    ["searchFoods", {
      async run(query) {
        const { foods, totalItems } = await foodRepository.searchFoods(userId, query, db);
        return {
          items: foods.map(foodCandidate),
          nutritionBasis: "PER_100_GRAMS",
          pagination: pagination(query, totalItems),
          restrictionValidation: "NOT_VERIFIED",
        };
      },
    }],
    ["searchRecipes", {
      async run(query) {
        const { recipes, totalItems } = await recipeRepository.searchRecipes(userId, query, db);
        // Fetch details in one batch, rechecking visibility for recipes AND
        // ingredient foods. Never expose another user's ingredient food.
        const details = recipes.length === 0 ? [] :
          await recipeRepository.findPlanRecipeDetails(
            userId, recipes.map((recipe) => recipe.id), db
          );
        const byId = new Map(details.map((recipe) => [recipe.id, recipe]));
        const items = [];
        for (const candidate of recipes) {
          const recipe = byId.get(candidate.id);
          // Seeded recipes may have no links; their stored nutrition is usable.
          // Still exclude oversized lists rather than returning partial details.
          if (!recipe ||
              recipe.ingredients.length > PLAN_TOOL_LIMITS.ingredientsPerRecipe) continue;
          items.push({
            id: recipe.id,
            nameEn: recipe.nameEn,
            nameAr: recipe.nameAr,
            cuisine: recipe.cuisine,
            countryCode: recipe.countryCode,
            servings: Number(recipe.servings),
            totalYieldGrams: Number(recipe.totalYieldGrams),
            caloriesPerServing: Number(recipe.caloriesPerServing),
            proteinGramsPerServing: Number(recipe.proteinGramsPerServing),
            carbohydrateGramsPerServing: Number(recipe.carbohydrateGramsPerServing),
            fatGramsPerServing: Number(recipe.fatGramsPerServing),
            // Missing links mean unknown ingredients, not an ingredient-free
            // or allergen-free recipe. Never invent foods from its name.
            ingredientDataStatus: recipe.ingredients.length > 0 ? "LINKED" : "UNAVAILABLE",
            ingredients: recipe.ingredients.length === 0 ? null : recipe.ingredients.map((ingredient) => ({
              quantityGrams: Number(ingredient.quantityGrams),
              food: foodCandidate(ingredient.food),
            })),
          });
        }
        return {
          items,
          nutritionBasis: "PER_SERVING",
          ingredientQuantityBasis: "WHOLE_RECIPE",
          pagination: pagination(query, totalItems),
          // Pagination tracks searched candidates, before detail exclusions.
          omittedCandidates: recipes.length - items.length,
          restrictionValidation: "NOT_VERIFIED",
        };
      },
    }],
  ]);

  // Private helper: execute only entries already parsed by the batch schema.
  // Do not parse JSON or repeat argument validation here.
  async function executeSearch(search) {
    try {
      const result = { ok: true, ...await handlers.get(search.name).run(search.arguments) };
      if (Buffer.byteLength(JSON.stringify(result), "utf8") > PLAN_TOOL_LIMITS.responseBytes) {
        return failure("PLAN_TOOL_RESULT_TOO_LARGE", "The catalog result exceeds the size limit.");
      }
      return result;
    } catch {
      return failure("PLAN_TOOL_SEARCH_FAILED", "Catalog search failed.");
    }
  }

  return {
    definitions: getPlanToolDefinitions(),

    // The model calls searchPlanCatalog ONCE. The backend fans that request
    // out into database searches; this makes no additional AI requests.
    async execute(name, argumentsValue) {
      if (batchAttempted) {
        return failure("PLAN_TOOL_CALL_LIMIT", "Only one catalog search batch is allowed per generation.");
      }
      // Reserve the round before any await, including for invalid attempts.
      batchAttempted = true;

      if (name !== PLAN_CATALOG_TOOL_NAME) {
        return failure("PLAN_TOOL_UNKNOWN", "Only searchPlanCatalog is available to the AI.");
      }

      let args;
      try {
        const raw = typeof argumentsValue === "string"
          ? argumentsValue : JSON.stringify(argumentsValue);
        if (typeof raw !== "string" ||
            Buffer.byteLength(raw, "utf8") > PLAN_TOOL_LIMITS.batchArgumentBytes) {
          return failure("PLAN_TOOL_INVALID_ARGUMENTS", "Batch arguments are missing or too large.");
        }
        args = JSON.parse(raw);
      } catch {
        return failure("PLAN_TOOL_INVALID_ARGUMENTS", "Batch arguments must be valid JSON.");
      }

      // Validate EVERY search before executing the first database query.
      // An invalid name, filter, nested batch, or >24 searches rejects the batch.
      const parsed = searchPlanCatalogToolSchema.safeParse(args);
      if (!parsed.success) {
        return failure(
          "PLAN_TOOL_INVALID_ARGUMENTS",
          "The catalog search batch failed validation.",
          createPublicErrorDetails(parsed.error)
        );
      }
      if (parsed.data.searches.some((search) =>
        Buffer.byteLength(JSON.stringify(search.arguments), "utf8") > PLAN_TOOL_LIMITS.argumentBytes
      )) {
        return failure("PLAN_TOOL_INVALID_ARGUMENTS", "A search exceeds the argument size limit.");
      }

      const output = { ok: true, results: [] };
      for (const [index, search] of parsed.data.searches.entries()) {
        // Sequential execution avoids launching up to 24 database searches
        // at once. One failure remains a result, so other searches can succeed.
        const result = await executeSearch(search);
        output.results.push({ index, name: search.name, result });

        // Bound the entire payload, not only each individual search result.
        // Never present a silently truncated batch as a complete result.
        if (Buffer.byteLength(JSON.stringify(output), "utf8") > PLAN_TOOL_LIMITS.batchResponseBytes) {
          return failure(
            "PLAN_TOOL_RESULT_TOO_LARGE",
            "The combined catalog results exceed the generation size limit."
          );
        }
      }
      // ok means the batch completed, not that every individual search worked.
      // Consumers must inspect each entry's result.ok before using its items.
      return output;
    },
  };
}
