import {
  InvalidMealTimeError,
  MealNotFoundError,
  InvalidMealItemsError,
  PlanNotFoundError,
  PlanScheduleMismatchError,
  PlanStatusConflictError,
} from "../../middlewares/errorHandling.js";
import { formatInTimeZone } from "date-fns-tz";
import { getWeekdayForDate } from "../plans/plan.rules.js";
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
    sourcePlanDayId: input.planSource?.planDayId ?? null,
    sourceMealOptionId: input.planSource?.optionId ?? null,
    scheduledDate: input.planSource?.scheduledDate
      ? new Date(`${input.planSource.scheduledDate}T00:00:00.000Z`)
      : null,
  };
}

async function findAndValidatePlanMealOption(
  userId,
  planDayId,
  optionId,
  scheduledDate,
  db
) {
  const planDay = await mealRepository.findPlanDayForUser(planDayId, db);
  if (!planDay || planDay.plan?.userId !== userId) {
    throw new PlanNotFoundError("Prescribed plan day not found.");
  }
  const plan = planDay.plan;

  // 1. Status check: cannot log against DRAFT or DISCARDED plans
  if (plan.status === "DRAFT" || plan.status === "DISCARDED") {
    throw new PlanStatusConflictError(
      "Meals cannot be logged from draft or discarded plans.",
      "PLAN_NOT_ACTIVE"
    );
  }

  // 2. Scheduled coverage [startDate, endDate]
  const startDateStr = plan.startDate?.toISOString().slice(0, 10);
  const endDateStr = plan.endDate?.toISOString().slice(0, 10);
  if (scheduledDate < startDateStr || scheduledDate > endDateStr) {
    throw new PlanScheduleMismatchError(
      "Scheduled date falls outside the plan's coverage dates."
    );
  }

  // 3. Weekday matching
  const expectedWeekday = getWeekdayForDate(scheduledDate);
  if (planDay.dayOfWeek && planDay.dayOfWeek !== expectedWeekday) {
    throw new PlanScheduleMismatchError(
      `Prescribed meal is scheduled for ${planDay.dayOfWeek}, not ${expectedWeekday}.`
    );
  }

  // 4. Activation interval check
  const tz = plan.timezone || "UTC";
  if (plan.activatedAt) {
    const activatedDateStr = formatInTimeZone(plan.activatedAt, tz, "yyyy-MM-dd");
    if (scheduledDate < activatedDateStr) {
      throw new PlanScheduleMismatchError("Scheduled date falls before the plan's activation date.");
    }
  }
  if (plan.endedAt) {
    const endedDateStr = formatInTimeZone(plan.endedAt, tz, "yyyy-MM-dd");
    if (scheduledDate > endedDateStr) {
      throw new PlanScheduleMismatchError("Scheduled date falls after the plan's termination date.");
    }
  }

  const slots = [
    { key: "breakfastOptions", type: "BREAKFAST" },
    { key: "lunchOptions", type: "LUNCH" },
    { key: "dinnerOptions", type: "DINNER" },
    { key: "snackOptions", type: "SNACK" },
  ];

  let targetOption = null;
  let inferredSlot = null;

  for (const slot of slots) {
    const opts = planDay[slot.key];
    if (Array.isArray(opts)) {
      const found = opts.find((opt) => opt.id === optionId);
      if (found) {
        targetOption = found;
        inferredSlot = slot.type;
        break;
      }
    }
  }

  if (!targetOption) {
    throw new PlanNotFoundError("Prescribed meal option not found.");
  }

  return { planDay, targetOption, inferredSlot };
}

async function validatePlanSource(userId, planSource, db) {
  if (!planSource) return;
  await findAndValidatePlanMealOption(
    userId,
    planSource.planDayId,
    planSource.optionId,
    planSource.scheduledDate,
    db
  );
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
  assertMealTimeIsNotFuture(input.occurredAt);
  if (input.planSource) {
    await validatePlanSource(userId, input.planSource, db);
  }
  const itemRows = await prepareMealItems(userId, input.items, db);
  const meal = await mealRepository.createMeal(
    userId,
    buildMealData(input),
    itemRows,
    db
  );
  return serializeMeal(meal);
}

export async function logMealFromPlan(userId, input, db) {
  const { targetOption, inferredSlot } = await findAndValidatePlanMealOption(
    userId,
    input.planDayId,
    input.optionId,
    input.scheduledDate,
    db
  );

  const mealType = input.mealType || inferredSlot;
  const occurredAt = input.occurredAt || new Date();
  assertMealTimeIsNotFuture(occurredAt);

  let itemsToPrepare = input.items;
  if (!itemsToPrepare || itemsToPrepare.length === 0) {
    itemsToPrepare = (targetOption.items || []).map((item) => {
      if (item.itemType === "FOOD") {
        return {
          itemType: "FOOD",
          foodId: item.foodId,
          quantityGrams: item.quantityGrams,
        };
      }
      if (item.itemType === "RECIPE") {
        return {
          itemType: "RECIPE",
          recipeId: item.recipeId,
          servings: item.servings,
        };
      }
      return item;
    });
  }

  if (!itemsToPrepare || itemsToPrepare.length === 0) {
    throw new InvalidMealItemsError("A meal needs at least one item.");
  }

  const itemRows = await prepareMealItems(userId, itemsToPrepare, db);
  const mealData = {
    mealType,
    occurredAt,
    notes: input.notes ?? null,
    sourcePlanDayId: input.planDayId,
    sourceMealOptionId: input.optionId,
    scheduledDate: new Date(`${input.scheduledDate}T00:00:00.000Z`),
  };

  const meal = await mealRepository.createMeal(
    userId,
    mealData,
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
