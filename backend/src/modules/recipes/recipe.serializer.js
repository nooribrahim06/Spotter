function decimalToNumber(value) {
  return Number(value);
}

export function serializeRecipeSummary(recipe, userId) {
  return {
    id: recipe.id,
    nameEn: recipe.nameEn,
    nameAr: recipe.nameAr,
    aliases: recipe.aliases ?? [],
    servings: decimalToNumber(recipe.servings),
    totalYieldGrams: decimalToNumber(recipe.totalYieldGrams),
    caloriesPerServing: decimalToNumber(recipe.caloriesPerServing),
    proteinGramsPerServing: decimalToNumber(
      recipe.proteinGramsPerServing
    ),
    carbohydrateGramsPerServing: decimalToNumber(
      recipe.carbohydrateGramsPerServing
    ),
    fatGramsPerServing: decimalToNumber(recipe.fatGramsPerServing),
    countryCode: recipe.countryCode,
    cuisine: recipe.cuisine,
    isCustom: recipe.createdByUserId !== null,
    canEdit: recipe.createdByUserId === userId,
    createdAt: recipe.createdAt,
    updatedAt: recipe.updatedAt,
  };
}

export function serializeRecipeDetails(recipe, userId) {
  return {
    ...serializeRecipeSummary(recipe, userId),
    instructions: recipe.instructions,
    ingredients: recipe.ingredients.map((ingredient) => ({
      id: ingredient.id,
      orderIndex: ingredient.orderIndex,
      quantityGrams: decimalToNumber(ingredient.quantityGrams),
      food: {
        id: ingredient.food.id,
        nameEn: ingredient.food.nameEn,
        nameAr: ingredient.food.nameAr,
        category: ingredient.food.category,
        caloriesPer100g: decimalToNumber(
          ingredient.food.caloriesPer100g
        ),
        proteinGramsPer100g: decimalToNumber(
          ingredient.food.proteinGramsPer100g
        ),
        carbohydrateGramsPer100g: decimalToNumber(
          ingredient.food.carbohydrateGramsPer100g
        ),
        fatGramsPer100g: decimalToNumber(
          ingredient.food.fatGramsPer100g
        ),
      },
    })),
  };
}
