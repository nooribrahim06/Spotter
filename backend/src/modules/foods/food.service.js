import * as foodRepository from "./food.repository.js";
import { serializeFood } from "./food.serializer.js";

export async function searchFood(userId, searchParams, db) {
  const { search, category, page, limit } = searchParams;
  const { foods, totalItems } = await foodRepository.searchFoods(
    userId,
    { search, category, page, limit },
    db
  );
  const totalPages = Math.ceil(totalItems / limit);

  return {
    items: foods.map(serializeFood),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages,
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages,
    },
  };
}

export async function getFoodOverview(userId, db) {
  const [recentFoodItems, customFoods] = await Promise.all([
    foodRepository.findRecentFoodsForUser(userId, db),
    foodRepository.findCustomFoodsForUser(userId, db),
  ]);

  return {
    recentFoods: recentFoodItems.map(({ food }) => serializeFood(food)),
    customFoods: customFoods.map(serializeFood),
  };
}

export async function createCustomFood(userId, foodData, db) {
  const food = await foodRepository.createCustomFood(userId, foodData, db);
  return serializeFood(food);
}
