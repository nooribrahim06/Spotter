import {
  InvalidMealTimeError,
  MealNotFoundError,
  InvalidMealItemsError,
} from "../../middlewares/errorHandling.js";
import * as mealRepository from "./meal.repository.js";
import {
  buildMealDateRange,
  buildMealItemSnapshots,
} from "./meal.rules.js";
import { serializeMeal } from "./meal.serializer.js";

const FUTURE_CLOCK_TOLERANCE_MS = 5 * 60 * 1000;

function assertMealTimeIsNotFuture(occurredAt) {
  if (
    occurredAt.getTime() >
    Date.now() + FUTURE_CLOCK_TOLERANCE_MS
  ) {
    throw new InvalidMealTimeError();
  }
}

function buildMealData(input) {
  return {
    mealType: input.mealType,
    occurredAt: input.occurredAt,
    notes: input.notes ?? null,
  };
}

async function prepareMealItems(userId, items, db) {
    // simple logic to separate the food and recipes to 2 lists 
    // to be able to handle them separatly in the db 
  const foodIds = items
    .filter((item) => item.itemType === "FOOD")
    .map((item) => item.foodId);
  const recipeIds = items
    .filter((item) => item.itemType === "RECIPE")
    .map((item) => item.recipeId);

  const [foods, recipes] = await Promise.all([
    // this is just returning the food and recipes that are accessible to this user
    // accordging to the repo rules of this 
    mealRepository.findAccessibleFoods(userId, foodIds, db),
    mealRepository.findAccessibleRecipes(userId, recipeIds, db),
  ]);

  if (foods.length !== foodIds.length || recipes.length !== recipeIds.length) {
    throw new InvalidMealItemsError();
  }

  return buildMealItemSnapshots(items, foods, recipes);
}

export async function listMeals(userId, query, timezone, db) {
  const dateRange = query.date
    ? buildMealDateRange(query.date, timezone)
    : null;
  const { meals, totalItems } = await mealRepository.findMeals(
    userId,
    {
      page: query.page,
      limit: query.limit,
      dateRange,
    },
    db
  );
  const totalPages = Math.ceil(totalItems / query.limit);

  return {
    items: meals.map(serializeMeal),
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

export async function getMealById(userId, mealId, db) {
  const meal = await mealRepository.findOwnedMealById(
    mealId,
    userId,
    db
  );
  if (!meal) throw new MealNotFoundError();
  return serializeMeal(meal);
}

export async function createMeal(userId, input, db) {
    // we need to check the time coming from the client 
    // to ensure that it is not in the future, with a tolerance of 5 minutes
  assertMealTimeIsNotFuture(input.occurredAt);
  // prepare meal items is the real logic 
  // we need to take a snapshot of the food and recipe items at the time of the meal creation
  // if the user cahnge the calories or nutrition of "his own" food or recipes after the meal creation 
  // we will have the snapshots already store 
  const itemRows = await prepareMealItems(userId, input.items, db);
  const meal = await mealRepository.createMeal(
    userId,
    buildMealData(input),
    itemRows,
    db
  );
  return serializeMeal(meal);
}

export async function replaceMeal(userId, mealId, input, db) {
  assertMealTimeIsNotFuture(input.occurredAt);

  const ownedMeal = await mealRepository.findOwnedMealIdentity(
    mealId,
    userId,
    db
  );
  if (!ownedMeal) throw new MealNotFoundError();
  // this is the same func , we just recalculate the snapshot of the meal 
  // all of it 
  const itemRows = await prepareMealItems(userId, input.items, db);
  const meal = await mealRepository.replaceOwnedMeal(
    mealId,
    userId,
    buildMealData(input),
    itemRows,
    db
  );
  if (!meal) throw new MealNotFoundError();
  return serializeMeal(meal);
}

export async function deleteMeal(userId, mealId, db) {
  const deleted = await mealRepository.deleteOwnedMeal(
    mealId,
    userId,
    db
  );
  if (!deleted) throw new MealNotFoundError();
}
