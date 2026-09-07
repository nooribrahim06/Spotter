function decimalToNumber(value) {
  return Number(value);
}

export function serializeFood(food) {
  return {
    id: food.id,
    nameEn: food.nameEn,
    nameAr: food.nameAr,
    aliases: food.aliases ?? [],
    category: food.category,
    caloriesPer100g: decimalToNumber(food.caloriesPer100g),
    proteinGramsPer100g: decimalToNumber(food.proteinGramsPer100g),
    carbohydrateGramsPer100g: decimalToNumber(
      food.carbohydrateGramsPer100g
    ),
    fatGramsPer100g: decimalToNumber(food.fatGramsPer100g),
    isCustom: food.createdByUserId !== null,
    createdAt: food.createdAt,
    updatedAt: food.updatedAt,
  };
}
