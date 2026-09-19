function decimalToNumber(value) {
  return value === null ? null : Number(value);
}

function roundedTotal(values) {
  return Number(
    values
      .reduce((total, value) => total + Number(value), 0)
      .toFixed(2)
  );
}

function serializeMealItem(item) {
  return {
    id: item.id,
    itemType: item.itemType,
    foodId: item.foodId,
    recipeId: item.recipeId,
    itemName: item.itemName,
    orderIndex: item.orderIndex,
    quantityGrams: decimalToNumber(item.quantityGrams),
    servings: decimalToNumber(item.servings),
    calories: decimalToNumber(item.calories),
    proteinGrams: decimalToNumber(item.proteinGrams),
    carbohydrateGrams: decimalToNumber(item.carbohydrateGrams),
    fatGrams: decimalToNumber(item.fatGrams),
    createdAt: item.createdAt,
  };
}

export function serializeMeal(meal) {
  const items = meal.items.map(serializeMealItem);
  const macrosComplete = items.every(
    (item) =>
      item.proteinGrams !== null &&
      item.carbohydrateGrams !== null &&
      item.fatGrams !== null
  );

  return {
    id: meal.id,
    mealType: meal.mealType,
    occurredAt: meal.occurredAt,
    notes: meal.notes,
    totals: {
      calories: roundedTotal(items.map((item) => item.calories)),
      proteinGrams: macrosComplete
        ? roundedTotal(items.map((item) => item.proteinGrams))
        : null,
      carbohydrateGrams: macrosComplete
        ? roundedTotal(items.map((item) => item.carbohydrateGrams))
        : null,
      fatGrams: macrosComplete
        ? roundedTotal(items.map((item) => item.fatGrams))
        : null,
      macrosComplete,
    },
    items,
    sourcePlanDayId: meal.sourcePlanDayId ?? null,
    sourceMealOptionId: meal.sourceMealOptionId ?? null,
    scheduledDate: meal.scheduledDate ? (meal.scheduledDate.toISOString ? meal.scheduledDate.toISOString().slice(0, 10) : String(meal.scheduledDate).slice(0, 10)) : null,
    createdAt: meal.createdAt,
    updatedAt: meal.updatedAt,
  };
}
