import { Prisma } from "../../generated/prisma/client.ts";
import {
  InvalidMealItemsError,
  MealTimezoneRequiredError,
} from "../../middlewares/errorHandling.js";

function decimal(value) {
  return new Prisma.Decimal(value);
}

function round(value) {
  return decimal(value).toDecimalPlaces(2);
}

function scaledNutrition(source, multiplier, suffix) {
  const scale = decimal(multiplier);
  return {
    calories: round(decimal(source[`calories${suffix}`]).mul(scale)),
    proteinGrams: round(
      decimal(source[`proteinGrams${suffix}`]).mul(scale)
    ),
    carbohydrateGrams: round(
      decimal(source[`carbohydrateGrams${suffix}`]).mul(scale)
    ),
    fatGrams: round(
      decimal(source[`fatGrams${suffix}`]).mul(scale)
    ),
  };
}

export function buildMealItemSnapshots(items, foods, recipes) {
  // Maps let each item find its loaded source by ID without repeatedly
  // searching the food and recipe arrays.
  const foodsById = new Map(foods.map((food) => [food.id, food]));
  const recipesById = new Map(
    recipes.map((recipe) => [recipe.id, recipe])
  );

  return items.map((item, orderIndex) => {
    if (item.itemType === "FOOD") {
      const food = foodsById.get(item.foodId);
      if (!food) throw new InvalidMealItemsError();
      const quantityGrams = round(item.quantityGrams);

      return {
        itemType: "FOOD",
        foodId: food.id,
        recipeId: null,
        itemName: food.nameEn,
        orderIndex,
        quantityGrams,
        servings: null,
        ...scaledNutrition(
          food,
          quantityGrams.div(100),
          "Per100g"
        ),
      };
    }

    if (item.itemType === "RECIPE") {
      const recipe = recipesById.get(item.recipeId);
      if (!recipe) throw new InvalidMealItemsError();
      const servings = round(item.servings);

      return {
        itemType: "RECIPE",
        foodId: null,
        recipeId: recipe.id,
        itemName: recipe.nameEn,
        orderIndex,
        quantityGrams: null,
        servings,
        ...scaledNutrition(recipe, servings, "PerServing"),
      };
    }

    return {
      itemType: "QUICK",
      foodId: null,
      recipeId: null,
      itemName: item.itemName,
      orderIndex,
      quantityGrams: null,
      servings: null,
      calories: round(item.calories),
      proteinGrams:
        item.proteinGrams === null ? null : round(item.proteinGrams),
      carbohydrateGrams:
        item.carbohydrateGrams === null
          ? null
          : round(item.carbohydrateGrams),
      fatGrams: item.fatGrams === null ? null : round(item.fatGrams),
    };
  });
}

function datePartsInTimezone(instantMs, timezone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date(instantMs))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
  return parts;
}

function localMidnightToUtc(year, month, day, timezone) {
  const targetAsUtc = Date.UTC(year, month - 1, day);
  let guess = targetAsUtc;

  // Re-evaluate because the UTC offset can differ across a DST boundary.
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const parts = datePartsInTimezone(guess, timezone);
    const representedAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    const nextGuess = guess - (representedAsUtc - targetAsUtc);
    if (nextGuess === guess) break;
    guess = nextGuess;
  }

  return new Date(guess);
}
// this is whole about the timezone and the date range of the meal
export function buildMealDateRange(date, timezone) {
  if (!timezone) throw new MealTimezoneRequiredError();
// we just returning the start and end of the date in the timezone
  const [year, month, day] = date.split("-").map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));

  try {
    return {
      start: localMidnightToUtc(year, month, day, timezone),
      end: localMidnightToUtc(
        nextDay.getUTCFullYear(),
        nextDay.getUTCMonth() + 1,
        nextDay.getUTCDate(),
        timezone
      ),
    };
  } catch (error) {
    if (error instanceof RangeError) {
      throw new MealTimezoneRequiredError(
        "Set a valid IANA timezone before filtering meals by date."
      );
    }
    throw error;
  }
}
