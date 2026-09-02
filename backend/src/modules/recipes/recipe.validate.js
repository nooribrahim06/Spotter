import * as z from "zod";

const recipeName = z
  .string()
  .trim()
  .min(1, "Recipe name is required.")
  .max(200, "Recipe name must be at most 200 characters.");

const optionalRecipeName = z
  .string()
  .trim()
  .min(1, "Arabic recipe name cannot be empty.")
  .max(200, "Arabic recipe name must be at most 200 characters.")
  .nullable()
  .optional();

const optionalCuisine = z
  .string()
  .trim()
  .min(1, "Cuisine cannot be empty.")
  .max(100, "Cuisine must be at most 100 characters.")
  .nullable()
  .optional();

const optionalCountryCode = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2}$/, "Country code must contain two letters.")
  .transform((value) => value.toUpperCase())
  .nullable()
  .optional();

const optionalInstructions = z
  .string()
  .trim()
  .min(1, "Instructions cannot be empty.")
  .max(10000, "Instructions must be at most 10000 characters.")
  .nullable()
  .optional();

const ingredientSchema = z
  .object({
    foodId: z.string().uuid("Food ID must be a valid UUID."),
    quantityGrams: z
      .number()
      .finite("Ingredient quantity must be a finite number.")
      .gt(0, "Ingredient quantity must be greater than zero.")
      .max(100000, "Ingredient quantity is too large."),
  })
  .strict();

const recipeBodySchema = z
  .object({
    nameEn: recipeName,
    nameAr: optionalRecipeName,
    servings: z
      .number()
      .finite("Servings must be a finite number.")
      .gt(0, "Servings must be greater than zero.")
      .max(1000, "Servings cannot exceed 1000."),
    countryCode: optionalCountryCode,
    cuisine: optionalCuisine,
    instructions: optionalInstructions,
    ingredients: z
      .array(ingredientSchema)
      .min(1, "A recipe needs at least one ingredient.")
      .max(100, "A recipe cannot contain more than 100 ingredients."),
  })
  .strict()
  .superRefine((data, context) => {
    const foodIds = data.ingredients.map((ingredient) => ingredient.foodId);
    if (new Set(foodIds).size !== foodIds.length) {
      context.addIssue({
        code: "custom",
        path: ["ingredients"],
        message:
          "Each food may appear only once; combine duplicate quantities.",
      });
    }
  });

export const createRecipeSchema = recipeBodySchema;
export const replaceRecipeSchema = recipeBodySchema;

export const recipeIdParamSchema = z
  .object({
    recipeId: z.string().uuid("Recipe ID must be a valid UUID."),
  })
  .strict();

export const deleteRecipeSchema = z
  .object({
    password: z.string().min(1).max(128),
  })
  .strict();

export const searchRecipesQuerySchema = z
  .object({
    search: z.string().trim().min(1).max(100).optional(),
    cuisine: z.string().trim().min(1).max(100).optional(),
    countryCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/, "Country code must contain two letters.")
      .transform((value) => value.toUpperCase())
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
