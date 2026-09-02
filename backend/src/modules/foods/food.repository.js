import { prisma } from "../../lib/prisma.js";
import { databaseError } from "../../middlewares/errorHandling.js";

const foodSelect = {
  id: true,
  nameEn: true,
  nameAr: true,
  aliases: true,
  category: true,
  caloriesPer100g: true,
  proteinGramsPer100g: true,
  carbohydrateGramsPer100g: true,
  fatGramsPer100g: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
};

const RECENT_FOOD_LIMIT = 10;
const CUSTOM_FOOD_LIMIT = 20;

// The initial food screen needs only foods this user logged recently. Recipe
// meal items are excluded because they belong to the recipe section.
export async function findRecentFoodsForUser(userId, db = prisma) {
  try {
    return await db.mealItem.findMany({
      where: {
        itemType: "FOOD",
        foodId: { not: null },
        meal: { userId },
        food: {
          is: {
            isActive: true,
            OR: [{ createdByUserId: null }, { createdByUserId: userId }],
          },
        },
      },
      select: {
        food: { select: foodSelect },
      },
      distinct: ["foodId"],
      orderBy: [
        { meal: { occurredAt: "desc" } },
        { createdAt: "desc" },
      ],
      take: RECENT_FOOD_LIMIT,
    });
  } catch {
    throw new databaseError(
      "Database error occurred while finding recent foods."
    );
  }
}

export async function findCustomFoodsForUser(userId, db = prisma) {
  try {
    return await db.food.findMany({
      where: {
        createdByUserId: userId,
        isActive: true,
      },
      select: foodSelect,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: CUSTOM_FOOD_LIMIT,
    });
  } catch {
    throw new databaseError(
      "Database error occurred while finding custom foods."
    );
  }
}

export async function createCustomFood(userId, foodData, db = prisma) {
  // Build an explicit allowlist so ownership, catalog provenance, and archive
  // state can never be selected by request input.
  const data = {
    nameEn: foodData.nameEn,
    nameAr: foodData.nameAr ?? null,
    category: foodData.category ?? null,
    caloriesPer100g: foodData.caloriesPer100g,
    proteinGramsPer100g: foodData.proteinGramsPer100g,
    carbohydrateGramsPer100g: foodData.carbohydrateGramsPer100g,
    fatGramsPer100g: foodData.fatGramsPer100g,
    createdByUserId: userId,
  };

  try {
    return await db.food.create({ data, select: foodSelect });
  } catch {
    throw new databaseError("Database error occurred while creating the food.");
  }
}
export async function searchFoods(
  userId,
  { search, category, page, limit },
  db = prisma
) {
  const skip = (page - 1) * limit;
  const where = {
    isActive: true,
    AND: [
      {
        OR: [
          { createdByUserId: null },
          { createdByUserId: userId },
        ],
      },
    ],
  };

  if (search) {
    where.AND.push({
      OR: [
        { nameEn: { contains: search, mode: "insensitive" } },
        { nameAr: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  if (category) {
    where.AND.push({ category });
  }

  try {
    const [foods, totalItems] = await Promise.all([
      db.food.findMany({
        where,
        select: foodSelect,
        orderBy: [{ nameEn: "asc" }, { id: "asc" }],
        skip,
        take: limit,
      }),
      db.food.count({ where }),
    ]);

    return { foods, totalItems };
  } catch {
    throw new databaseError(
      "Database error occurred while searching for foods."
    );
  }
}
