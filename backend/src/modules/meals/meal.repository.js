import { prisma } from "../../lib/prisma.js";
import { databaseError } from "../../middlewares/errorHandling.js";

const mealItemSelect = {
  id: true,
  itemType: true,
  foodId: true,
  recipeId: true,
  itemName: true,
  orderIndex: true,
  quantityGrams: true,
  servings: true,
  calories: true,
  proteinGrams: true,
  carbohydrateGrams: true,
  fatGrams: true,
  createdAt: true,
};

const mealSelect = {
  id: true,
  mealType: true,
  occurredAt: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  items: {
    select: mealItemSelect,
    orderBy: { orderIndex: "asc" },
  },
};
/// this is the condition we always use to make sure the user nly see 
// Global food and his own food 
// other users' food will not be visible to this user
function accessibleWhere(userId) {
  return {
    isActive: true,
    OR: [{ createdByUserId: null }, { createdByUserId: userId }],
  };
}

export async function findMeals(
  userId,
  { page, limit, dateRange },
  db = prisma
) {
  const where = {
    userId,
    ...(dateRange
      ? {
          occurredAt: {
            gte: dateRange.start,
            lt: dateRange.end,
          },
        }
      : {}),
  };

  try {
    const [meals, totalItems] = await Promise.all([
      db.meal.findMany({
        where,
        select: mealSelect,
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.meal.count({ where }),
    ]);
    return { meals, totalItems };
  } catch {
    throw new databaseError(
      "Database error occurred while finding meals."
    );
  }
}

export async function findOwnedMealById(mealId, userId, db = prisma) {
  try {
    return await db.meal.findFirst({
      where: { id: mealId, userId },
      select: mealSelect,
    });
  } catch {
    throw new databaseError(
      "Database error occurred while finding the meal."
    );
  }
}

export async function findOwnedMealIdentity(
  mealId,
  userId,
  db = prisma
) {
  try {
    return await db.meal.findFirst({
      where: { id: mealId, userId },
      select: { id: true },
    });
  } catch {
    throw new databaseError(
      "Database error occurred while checking meal ownership."
    );
  }
}

export async function findAccessibleFoods(userId, foodIds, db = prisma) {
  if (foodIds.length === 0) return [];

  try {
    return await db.food.findMany({
      where: {
        id: { in: foodIds },
        ...accessibleWhere(userId),
      },
      select: {
        id: true,
        nameEn: true,
        caloriesPer100g: true,
        proteinGramsPer100g: true,
        carbohydrateGramsPer100g: true,
        fatGramsPer100g: true,
      },
    });
  } catch {
    throw new databaseError(
      "Database error occurred while checking meal foods."
    );
  }
}

export async function findAccessibleRecipes(
  userId,
  recipeIds,
  db = prisma
) {
  if (recipeIds.length === 0) return [];

  try {
    return await db.recipe.findMany({
      where: {
        id: { in: recipeIds },
        ...accessibleWhere(userId),
      },
      select: {
        id: true,
        nameEn: true,
        caloriesPerServing: true,
        proteinGramsPerServing: true,
        carbohydrateGramsPerServing: true,
        fatGramsPerServing: true,
      },
    });
  } catch {
    throw new databaseError(
      "Database error occurred while checking meal recipes."
    );
  }
}

export async function createMeal(
  userId,
  mealData,
  itemRows,
  db = prisma
) {
  try {
    return await db.meal.create({
      data: {
        ...mealData,
        userId,
        items: { create: itemRows },
      },
      select: mealSelect,
    });
  } catch {
    throw new databaseError(
      "Database error occurred while creating the meal."
    );
  }
}
export async function replaceOwnedMeal(
  mealId,
  userId,
  mealData,
  itemRows,
  db = prisma
) {
  try {
    return await db.$transaction(async (tx) => {
      const updated = await tx.meal.updateMany({
        where: { id: mealId, userId },
        data: mealData,
      });
      if (updated.count === 0) return null;

      await tx.mealItem.deleteMany({ where: { mealId } });
      await tx.mealItem.createMany({
        data: itemRows.map((item) => ({ mealId, ...item })),
      });

      return tx.meal.findUnique({
        where: { id: mealId },
        select: mealSelect,
      });
    });
  } catch {
    throw new databaseError(
      "Database error occurred while updating the meal."
    );
  }
}

export async function deleteOwnedMeal(mealId, userId, db = prisma) {
  try {
    const result = await db.meal.deleteMany({
      where: { id: mealId, userId },
    });
    return result.count === 1;
  } catch {
    throw new databaseError(
      "Database error occurred while deleting the meal."
    );
  }
}
