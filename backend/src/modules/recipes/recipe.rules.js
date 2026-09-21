import { Prisma } from "@prisma/client";
import { InvalidRecipeIngredientsError } from "../../middlewares/errorHandling.js";

function decimal(value) {
  return new Prisma.Decimal(value);
}

function roundForStorage(value) {
  return value.toDecimalPlaces(2);
}

export function calculateRecipeNutrition(ingredients, foods, servings) {
  const foodsById = new Map(foods.map((food) => [food.id, food]));

  if (foodsById.size !== ingredients.length) {
    throw new InvalidRecipeIngredientsError();
  }

  let totalYieldGrams = decimal(0);
  let calories = decimal(0);
  let proteinGrams = decimal(0);
  let carbohydrateGrams = decimal(0);
  let fatGrams = decimal(0);

  const ingredientRows = ingredients.map((ingredient, orderIndex) => {
    const food = foodsById.get(ingredient.foodId);
    if (!food) throw new InvalidRecipeIngredientsError();

    const quantityGrams = decimal(ingredient.quantityGrams);
    const quantityInHundreds = quantityGrams.div(100);

    totalYieldGrams = totalYieldGrams.plus(quantityGrams);
    calories = calories.plus(
      decimal(food.caloriesPer100g).mul(quantityInHundreds)
    );
    proteinGrams = proteinGrams.plus(
      decimal(food.proteinGramsPer100g).mul(quantityInHundreds)
    );
    carbohydrateGrams = carbohydrateGrams.plus(
      decimal(food.carbohydrateGramsPer100g).mul(quantityInHundreds)
    );
    fatGrams = fatGrams.plus(
      decimal(food.fatGramsPer100g).mul(quantityInHundreds)
    );

    return {
      foodId: ingredient.foodId,
      quantityGrams: roundForStorage(quantityGrams),
      orderIndex,
    };
  });

  const servingCount = decimal(servings);

  return {
    ingredientRows,
    totals: {
      servings: roundForStorage(servingCount),
      totalYieldGrams: roundForStorage(totalYieldGrams),
      caloriesPerServing: roundForStorage(calories.div(servingCount)),
      proteinGramsPerServing: roundForStorage(
        proteinGrams.div(servingCount)
      ),
      carbohydrateGramsPerServing: roundForStorage(
        carbohydrateGrams.div(servingCount)
      ),
      fatGramsPerServing: roundForStorage(fatGrams.div(servingCount)),
    },
  };
}
