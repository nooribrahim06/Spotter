import { Buffer } from "node:buffer";
import { z } from "zod";
import { EXERCISE_OPTIONS } from "../../config/exercise.js";
import {
  InvalidAccessTokenError,
  PlanContextIncompleteError,
  PlanNotEligibleError,
} from "../../middlewares/errorHandling.js";
import { createPublicErrorDetails } from "../../middlewares/validatebody.js";
import * as exerciseRepository from "../exercises/exercise.repository.js";
import * as foodRepository from "../foods/food.repository.js";
import * as recipeRepository from "../recipes/recipe.repository.js";
import { evaluatePlanReadiness } from "./plan.rules.js";
import {
  PLAN_TOOL_LIMITS,
  getPlanToolDefinitions,
  searchExercisesToolSchema,
  searchRecipesToolSchema,
  searchFoodsToolSchema,
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
 *   // Return output to the model, correlated with that provider's call ID.
 *
 * The tools only retrieve candidates. The generation service must validate
 * the final selections, nutrition, schedule, and restrictions before saving.
 */
export function createPlanTools({ userId, source, db }) {
  if (!z.string().uuid().safeParse(userId).success ||
      source?.user?.id?.toLowerCase() !== userId.toLowerCase()) {
    throw new InvalidAccessTokenError();
  }

  const readiness = evaluatePlanReadiness(source);
  if (readiness.blocked) throw new PlanNotEligibleError(readiness);
  if (!readiness.ready) throw new PlanContextIncompleteError(readiness);

  // Capture server-owned equipment now. AI arguments can only narrow it.
  // Bodyweight requires no purchased equipment. Unknown profile codes do not
  // imply access to every machine in a gym.
  const allowedEquipment = [...new Set([
    "BODY_WEIGHT",
    ...(source.trainingProfile.availableEquipment ?? [])
      .map((item) => item.code)
      .filter((code) => EXERCISE_OPTIONS.equipment.includes(code)),
  ])];

  let calls = 0;
  const handlers = new Map([
    ["searchExercises", {
      schema: searchExercisesToolSchema,
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
          restrictionValidation: "REQUIRES_FINAL_PLAN_VALIDATION",
        };
      },
    }],
    ["searchFoods", {
      schema: searchFoodsToolSchema,
      async run(query) {
        const { foods, totalItems } = await foodRepository.searchFoods(userId, query, db);
        return {
          items: foods.map(foodCandidate),
          nutritionBasis: "PER_100_GRAMS",
          pagination: pagination(query, totalItems),
          restrictionValidation: "REQUIRES_FINAL_PLAN_VALIDATION",
        };
      },
    }],
    ["searchRecipes", {
      schema: searchRecipesToolSchema,
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
          restrictionValidation: "REQUIRES_FINAL_PLAN_VALIDATION",
        };
      },
    }],
  ]);

  return {
    definitions: getPlanToolDefinitions(),
    // Counts are session-local. The future HTTP endpoint also needs a
    // persistent/per-user rate limit and the AI loop needs an overall timeout.
    async execute(name, argumentsValue) {
      if (calls >= PLAN_TOOL_LIMITS.callsPerGeneration) {
        return failure("PLAN_TOOL_CALL_LIMIT", "The catalog search budget is exhausted.");
      }
      // Count invalid calls as well; increment before any await.
      calls += 1;
      const handler = handlers.get(name);
      if (!handler) {
        return failure("PLAN_TOOL_UNKNOWN", "Only the advertised catalog search tools are allowed.");
      }

      let args;
      try {
        // Accept either parsed arguments or the JSON string returned by a
        // provider. Parsing never evaluates JavaScript or SQL.
        const raw = typeof argumentsValue === "string"
          ? argumentsValue : JSON.stringify(argumentsValue);
        if (typeof raw !== "string" ||
            Buffer.byteLength(raw, "utf8") > PLAN_TOOL_LIMITS.argumentBytes) {
          return failure("PLAN_TOOL_INVALID_ARGUMENTS", "Tool arguments are missing or too large.");
        }
        args = JSON.parse(raw);
      } catch {
        return failure("PLAN_TOOL_INVALID_ARGUMENTS", "Tool arguments must be valid JSON.");
      }

      const parsed = handler.schema.safeParse(args);
      if (!parsed.success) {
        return failure(
          "PLAN_TOOL_INVALID_ARGUMENTS",
          "Tool arguments failed validation.",
          createPublicErrorDetails(parsed.error)
        );
      }

      try {
        const result = await handler.run(parsed.data);
        if (Buffer.byteLength(JSON.stringify(result), "utf8") > PLAN_TOOL_LIMITS.responseBytes) {
          return failure("PLAN_TOOL_RESULT_TOO_LARGE", "Retry with a smaller result limit.");
        }
        return { ok: true, ...result };
      } catch {
        // Do not return database errors, SQL, stack traces, or credentials.
        return failure("PLAN_TOOL_SEARCH_FAILED", "Catalog search failed. Try again later.");
      }
    },
  };
}
