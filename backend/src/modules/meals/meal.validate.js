import * as z from "zod";

const mealTypes = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"];

const positiveQuantity = (label, maximum) =>
  z
    .number()
    .finite(`${label} must be a finite number.`)
    .gt(0, `${label} must be greater than zero.`)
    .max(maximum, `${label} is too large.`);

const optionalMacro = (label) =>
  z
    .number()
    .finite(`${label} must be a finite number.`)
    .min(0, `${label} cannot be negative.`)
    .max(100000, `${label} is too large.`)
    .nullable()
    .optional()
    .default(null);

const foodItemSchema = z
  .object({
    itemType: z.literal("FOOD"),
    foodId: z.string().uuid("Food ID must be a valid UUID."),
    quantityGrams: positiveQuantity("Food quantity", 100000),
  })
  .strict();

const recipeItemSchema = z
  .object({
    itemType: z.literal("RECIPE"),
    recipeId: z.string().uuid("Recipe ID must be a valid UUID."),
    servings: positiveQuantity("Recipe servings", 1000),
  })
  .strict();

const quickItemSchema = z
  .object({
    itemType: z.literal("QUICK"),
    itemName: z
      .string()
      .trim()
      .min(1, "Quick-add name cannot be empty.")
      .max(200, "Quick-add name must be at most 200 characters.")
      .optional()
      .default("Quick add"),
    calories: positiveQuantity("Calories", 100000),
    proteinGrams: optionalMacro("Protein"),
    carbohydrateGrams: optionalMacro("Carbohydrate"),
    fatGrams: optionalMacro("Fat"),
  })
  .strict();

const mealItemSchema = z.discriminatedUnion("itemType", [
  foodItemSchema,
  recipeItemSchema,
  quickItemSchema,
]);

const mealBodySchema = z
  .object({
    mealType: z.enum(mealTypes),
    occurredAt: z.iso
      .datetime({ offset: true })
      .transform((value) => new Date(value)),
    notes: z
      .string()
      .trim()
      .min(1, "Notes cannot be empty.")
      .max(1000, "Notes must be at most 1000 characters.")
      .nullable()
      .optional(),
    items: z
      .array(mealItemSchema)
      .min(1, "A meal needs at least one item.")
      .max(100, "A meal cannot contain more than 100 items."),
  })
  .strict()
  .superRefine((data, context) => {
    const foodIds = data.items
      .filter((item) => item.itemType === "FOOD")
      .map((item) => item.foodId);
    const recipeIds = data.items
      .filter((item) => item.itemType === "RECIPE")
      .map((item) => item.recipeId);

    if (new Set(foodIds).size !== foodIds.length) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message:
          "Each food may appear only once; combine duplicate quantities.",
      });
    }
    if (new Set(recipeIds).size !== recipeIds.length) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message:
          "Each recipe may appear only once; combine duplicate servings.",
      });
    }
  });

function isCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export const createMealSchema = mealBodySchema;
export const replaceMealSchema = mealBodySchema;

export const mealIdParamSchema = z
  .object({
    mealId: z.string().uuid("Meal ID must be a valid UUID."),
  })
  .strict();

export const listMealsQuerySchema = z
  .object({
    date: z
      .string()
      .refine(isCalendarDate, "Date must be a real YYYY-MM-DD date.")
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
