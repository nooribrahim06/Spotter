import * as z from "zod";

const foodName = z
  .string()
  .trim()
  .min(1, "Food name is required.")
  .max(200, "Food name must be at most 200 characters.");

const optionalFoodName = z
  .string()
  .trim()
  .min(1, "Arabic food name cannot be empty.")
  .max(200, "Arabic food name must be at most 200 characters.")
  .nullable()
  .optional();

const optionalCategory = z
  .string()
  .trim()
  .min(1, "Category cannot be empty.")
  .max(100, "Category must be at most 100 characters.")
  .nullable()
  .optional();

const caloriesPer100g = z
  .number()
  .finite("Calories must be a finite number.")
  .min(0, "Calories cannot be negative.")
  .max(1000, "Calories per 100g cannot exceed 1000.");

function macroPer100g(label) {
  return z
    .number()
    .finite(`${label} must be a finite number.`)
    .min(0, `${label} cannot be negative.`)
    .max(100, `${label} per 100g cannot exceed 100.`);
}

export const createCustomFoodSchema = z
  .object({
    nameEn: foodName,
    nameAr: optionalFoodName,
    category: optionalCategory,
    caloriesPer100g,
    proteinGramsPer100g: macroPer100g("Protein"),
    carbohydrateGramsPer100g: macroPer100g("Carbohydrate"),
    fatGramsPer100g: macroPer100g("Fat"),
  })
  .strict();
// ========= search query validation =========
export const getFoodsQuerySchema = z.object({
  search: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional(),

  category: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional(),

  page: z.coerce
    .number()
    .int()
    .min(1)
    .default(1),

  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20),
}).strict();
