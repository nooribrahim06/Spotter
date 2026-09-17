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

const RECENT_RECIPE_LIMIT = 10;
const CUSTOM_RECIPE_LIMIT = 20;

function visibleRecipeWhere(userId) {
  return {
    isActive: true,
    OR: [{ createdByUserId: null }, { createdByUserId: userId }],
  };
}

export async function findRecentRecipesForUser(
  userId,
  db = prisma
) {
  try {
    return await db.mealItem.findMany({
      where: {
        itemType: "RECIPE",
        recipeId: { not: null },
        meal: { userId },
        recipe: {
          is: visibleRecipeWhere(userId),
        },
      },
      select: {
        recipe: { select: recipeSummarySelect },
      },
      distinct: ["recipeId"],
      orderBy: [
        { meal: { occurredAt: "desc" } },
        { createdAt: "desc" },
      ],
      take: RECENT_RECIPE_LIMIT,
    });
  } catch {
    throw new databaseError(
      "Database error occurred while finding recent recipes."
    );
  }
}

export async function findCustomRecipesForUser(
  userId,
  db = prisma
) {
  try {
    return await db.recipe.findMany({
      where: {
        createdByUserId: userId,
        isActive: true,
      },
      select: recipeSummarySelect,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: CUSTOM_RECIPE_LIMIT,
    });
  } catch {
    throw new databaseError(
      "Database error occurred while finding custom recipes."
    );
  }
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

// Internal plan search: hydrate a bounded page of recipe candidates.
// Recheck BOTH recipe visibility and every ingredient food before returning
// ingredient names/nutrition. Never return a partial list as the whole recipe.
// Seeded recipes can have stored nutrition without any ingredient links.
export async function findPlanRecipeDetails(userId, recipeIds, db = prisma) {
  try {
    return await db.recipe.findMany({
      where: {
        id: { in: recipeIds },
        ...visibleRecipeWhere(userId),
        ingredients: {
          // With no rows, every passes. Existing linked foods must still be
          // active and accessible; no ingredient details are silently removed.
          every: {
            food: {
              is: {
                isActive: true,
                OR: [{ createdByUserId: null }, { createdByUserId: userId }],
              },
            },
          },
        },
      },
      select: {
        id: true,
        nameEn: true,
        nameAr: true,
        cuisine: true,
        countryCode: true,
        servings: true,
        totalYieldGrams: true,
        caloriesPerServing: true,
        proteinGramsPerServing: true,
        carbohydrateGramsPerServing: true,
        fatGramsPerServing: true,
        ingredients: {
          select: {
            quantityGrams: true,
            food: { select: ingredientFoodSelect },
          },
          orderBy: [{ orderIndex: "asc" }, { id: "asc" }],
          // One extra row detects oversized recipes without truncating silently.
          take: 101,
        },
      },
      take: 10,
    });
  } catch {
    throw new databaseError("Database error occurred while loading plan recipe candidates.");
  }
}
