import { prisma } from "../../lib/prisma.js";
import { databaseError } from "../../middlewares/errorHandling.js";

const recipeSummarySelect = {
  id: true,
  nameEn: true,
  nameAr: true,
  aliases: true,
  createdByUserId: true,
  servings: true,
  totalYieldGrams: true,
  caloriesPerServing: true,
  proteinGramsPerServing: true,
  carbohydrateGramsPerServing: true,
  fatGramsPerServing: true,
  countryCode: true,
  cuisine: true,
  createdAt: true,
  updatedAt: true,
};

const ingredientFoodSelect = {
  id: true,
  nameEn: true,
  nameAr: true,
  category: true,
  caloriesPer100g: true,
  proteinGramsPer100g: true,
  carbohydrateGramsPer100g: true,
  fatGramsPer100g: true,
};

const recipeDetailSelect = {
  ...recipeSummarySelect,
  instructions: true,
  ingredients: {
    select: {
      id: true,
      orderIndex: true,
      quantityGrams: true,
      food: { select: ingredientFoodSelect },
    },
    orderBy: { orderIndex: "asc" },
  },
};

function visibleRecipeWhere(userId) {
  return {
    isActive: true,
    OR: [{ createdByUserId: null }, { createdByUserId: userId }],
  };
}

export async function searchRecipes(
  userId,
  { search, cuisine, countryCode, page, limit },
  db = prisma
) {
  const where = visibleRecipeWhere(userId);
  const filters = [];

  if (search) {
    filters.push({
      OR: [
        { nameEn: { contains: search, mode: "insensitive" } },
        { nameAr: { contains: search, mode: "insensitive" } },
      ],
    });
  }
  if (cuisine) filters.push({ cuisine });
  if (countryCode) filters.push({ countryCode });
  if (filters.length > 0) where.AND = filters;

  try {
    const [recipes, totalItems] = await Promise.all([
      db.recipe.findMany({
        where,
        select: recipeSummarySelect,
        orderBy: [{ nameEn: "asc" }, { id: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.recipe.count({ where }),
    ]);

    return { recipes, totalItems };
  } catch {
    throw new databaseError(
      "Database error occurred while searching for recipes."
    );
  }
}

export async function findVisibleRecipeById(
  recipeId,
  userId,
  db = prisma
) {
  try {
    return await db.recipe.findFirst({
      where: {
        id: recipeId,
        ...visibleRecipeWhere(userId),
      },
      select: recipeDetailSelect,
    });
  } catch {
    throw new databaseError(
      "Database error occurred while finding the recipe."
    );
  }
}

export async function findOwnedActiveRecipe(
  recipeId,
  userId,
  db = prisma
) {
  try {
    return await db.recipe.findFirst({
      where: {
        id: recipeId,
        createdByUserId: userId,
        isActive: true,
      },
      select: { id: true },
    });
  } catch {
    throw new databaseError(
      "Database error occurred while checking recipe ownership."
    );
  }
}

export async function findAccessibleIngredientFoods(
  userId,
  foodIds,
  db = prisma
) {
  try {
    return await db.food.findMany({
      where: {
        id: { in: foodIds },
        isActive: true,
        OR: [{ createdByUserId: null }, { createdByUserId: userId }],
      },
      select: {
        id: true,
        caloriesPer100g: true,
        proteinGramsPer100g: true,
        carbohydrateGramsPer100g: true,
        fatGramsPer100g: true,
      },
    });
  } catch {
    throw new databaseError(
      "Database error occurred while checking recipe ingredients."
    );
  }
}

export async function createRecipe(
  userId,
  recipeData,
  ingredientRows,
  db = prisma
) {
  try {
    return await db.recipe.create({
      data: {
        ...recipeData,
        createdByUserId: userId,
        ingredients: { create: ingredientRows },
      },
      select: recipeDetailSelect,
    });
  } catch {
    throw new databaseError(
      "Database error occurred while creating the recipe."
    );
  }
}

export async function replaceOwnedRecipe(
  recipeId,
  userId,
  recipeData,
  ingredientRows,
  db = prisma
) {
  async function replaceInsideTransaction(tx) {
    const updated = await tx.recipe.updateMany({
      where: {
        id: recipeId,
        createdByUserId: userId,
        isActive: true,
      },
      data: recipeData,
    });

    if (updated.count === 0) return null;

    await tx.recipeIngredient.deleteMany({
      where: { recipeId },
    });
    await tx.recipeIngredient.createMany({
      data: ingredientRows.map((ingredient) => ({
        recipeId,
        ...ingredient,
      })),
    });

    return tx.recipe.findUnique({
      where: { id: recipeId },
      select: recipeDetailSelect,
    });
  }

  try {
    // A transaction client has no $transaction method. Supporting both forms
    // keeps this operation atomic on its own and composable in larger workflows.
    if (typeof db.$transaction === "function") {
      return await db.$transaction(replaceInsideTransaction);
    }
    return await replaceInsideTransaction(db);
  } catch {
    throw new databaseError(
      "Database error occurred while updating the recipe."
    );
  }
}

export async function archiveOwnedRecipe(
  recipeId,
  userId,
  db = prisma
) {
  try {
    const result = await db.recipe.updateMany({
      where: {
        id: recipeId,
        createdByUserId: userId,
        isActive: true,
      },
      data: {
        isActive: false,
        archivedAt: new Date(),
      },
    });

    return result.count === 1;
  } catch {
    throw new databaseError(
      "Database error occurred while deleting the recipe."
    );
  }
}
