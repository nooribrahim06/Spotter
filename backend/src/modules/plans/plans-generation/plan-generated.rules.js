/**
 * QUICK SUMMARY: checks whether a structurally valid AI plan fits this user.
 * - Every selected ID came from a successful catalog search of the right type.
 * - Training days/time, equipment codes, and exercise tracking metrics fit.
 * - Meal slots match the nutrition style; every meal item is checked.
 * - Calories/macros are calculated from catalog portions, not AI claims.
 * - Primary meals AND all flexible combinations fit configured target tolerances.
 * Health/food restrictions go to the AI as planning inputs. This file does not
 * certify medical/allergy compatibility or block profiles for having them.
 * Professional-clearance eligibility is enforced by plan.rules.js.
 *
 * Does NOT repeat the Zod shape checks (types, seven unique days, rep ranges,
 * duplicate exercises, array/text limits). The generator already does those.
 * Does NOT save, requery current catalog access, or certify medical/allergy
 * safety from names. Guidance text and unrecorded apparatus cannot be verified
 * by these catalog fields; persistence/activation needs its own current checks.
 */
import { PLAN_NUTRITION_TOLERANCE, CONCRETE_MEAL_PLAN_STYLES } from "../../../config/plan.js";
import { PlanContentInvalidError } from "../../../middlewares/errorHandling.js";
import { PLAN_WEEKDAYS } from "./plan.content-schema.js";
import { getAllowedPlanEquipment } from "../plan.rules.js";

const CONCRETE_STYLES = new Set(CONCRETE_MEAL_PLAN_STYLES);
const GUIDANCE_STYLES = new Set(["MACRO_BASED", "SIMPLE_GUIDANCE"]);
const MEAL_SLOTS = ["breakfastOptions", "lunchOptions", "dinnerOptions", "snackOptions"];
const NUTRIENTS = [
  { key: "calories", target: "dailyCalories", tolerance: "caloriesPercent",
    food: "caloriesPer100g", recipe: "caloriesPerServing" },
  { key: "proteinGrams", target: "proteinGrams", tolerance: "proteinPercent",
    food: "proteinGramsPer100g", recipe: "proteinGramsPerServing" },
  { key: "carbohydrateGrams", target: "carbohydrateGrams", tolerance: "carbohydratePercent",
    food: "carbohydrateGramsPer100g", recipe: "carbohydrateGramsPerServing" },
  { key: "fatGrams", target: "fatGrams", tolerance: "fatPercent",
    food: "fatGramsPer100g", recipe: "fatGramsPerServing" },
];

function addIssue(issues, path, code, message) {
  issues.push({ path, code, message });
}

function emptyNutrition() {
  return Object.fromEntries(NUTRIENTS.map(({ key }) => [key, 0]));
}

/**
 * Prepare settings after the shared readiness check has passed. Meal-count
 * support and profile eligibility live only in plan.rules.js. Here we check
 * server target/tolerance configuration and choose the scheduled meal slots.
 */
export function prepareGeneratedPlanValidation({
  source,
  targets,
  nutritionTolerance = PLAN_NUTRITION_TOLERANCE,
}) {
  const nutrition = source.nutritionProfile;
  const style = nutrition.planStyle;
  const concrete = CONCRETE_STYLES.has(style);

  // Configuration errors are server bugs; user data cannot relax tolerances.
  if (concrete) {
    for (const nutrient of NUTRIENTS) {
      const tolerance = nutritionTolerance?.[nutrient.tolerance];
      if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 100) {
        throw new TypeError("Nutrition tolerances must be finite percentages from 0 to 100.");
      }
      if (!Number.isFinite(targets[nutrient.target]) || targets[nutrient.target] <= 0) {
        throw new TypeError("Concrete meal plans require positive backend nutrition targets.");
      }
    }
  }

  return {
    style, concrete, targets,
    nutritionTolerance: { ...nutritionTolerance },
    requiredSlots: concrete
      ? MEAL_SLOTS.slice(0, nutrition.snacksPerDay === 1 ? 4 : 3)
      : [],
  };
}

export function buildAuthorizedCatalog(toolResults) {
  const catalog = { exercises: new Map(), foods: new Map(), recipes: new Map() };
  const names = { searchExercises: "exercises", searchFoods: "foods", searchRecipes: "recipes" };
  for (const search of toolResults) {
    if (!search.result.ok) continue;
    const collection = catalog[names[search.name]];
    for (const item of search.result.items) {
      collection.set(item.id.toLowerCase(), item);
      if (search.name === "searchRecipes") {
        for (const { food } of item.ingredients ?? []) {
          catalog.foods.set(food.id.toLowerCase(), food);
        }
      }
    }
  }
  return catalog;
}

function validateExercise(prescription, exercise, equipment, path, issues) {
  if (!exercise) {
    addIssue(issues, path, "EXERCISE_NOT_AUTHORIZED", "Exercise ID was not returned by a successful search.");
    return;
  }
  // Search filtering reduces bad candidates. This checks the final selection
  // with the SAME shared equipment policy, not a second copy of that policy.
  if (!equipment.has(exercise.equipment)) {
    addIssue(issues, path, "EQUIPMENT_NOT_AVAILABLE", "Exercise requires unavailable equipment.");
  }
  const supported = new Set(exercise.trackingMetrics);
  const fields = [
    ["setsCount", "SETS"], ["repMin", "REPS"], ["weightKg", "WEIGHT"],
    ["durationSeconds", "DURATION"], ["distanceMeters", "DISTANCE"],
  ];
  for (const [field, metric] of fields) {
    if (prescription[field] !== null && !supported.has(metric)) {
      addIssue(issues, path + "." + field, "UNSUPPORTED_TRACKING_METRIC",
        "The selected exercise does not support " + metric + ".");
    }
  }
}

function calculateOption(option, catalog, path, issues) {
  const total = emptyNutrition();
  option.items.forEach((item, index) => {
    const itemPath = path + ".items." + index;
    const isFood = item.itemType === "FOOD";
    const id = isFood ? item.foodId : item.recipeId;
    const candidate = (isFood ? catalog.foods : catalog.recipes).get(id.toLowerCase());
    if (!candidate) {
      addIssue(issues, itemPath, "MEAL_ITEM_NOT_AUTHORIZED",
        "The selected item ID was not returned by a successful search of its type.");
      return;
    }
    // Stored recipe nutrients are PER SERVING. Never add ingredients again.
    const factor = isFood ? item.quantityGrams / 100 : item.servings;
    for (const nutrient of NUTRIENTS) {
      const value = candidate[isFood ? nutrient.food : nutrient.recipe];
      const amount = value * factor;
      if (!Number.isFinite(value) || value < 0 || !Number.isFinite(amount) ||
          !Number.isFinite(total[nutrient.key] + amount)) {
        addIssue(issues, itemPath, "INVALID_CATALOG_NUTRITION",
          "Nutrition must be finite, non-negative catalog data.");
      } else {
        total[nutrient.key] += amount;
      }
    }
  });
  return total;
}

function checkNutritionRange(minimum, maximum, settings, path, issues) {
  for (const nutrient of NUTRIENTS) {
    const target = settings.targets[nutrient.target];
    const margin = target * settings.nutritionTolerance[nutrient.tolerance] / 100;
    const min = minimum[nutrient.key];
    const max = maximum[nutrient.key];
    // Small arithmetic noise is not a nutritional mismatch.
    if (!Number.isFinite(min) || !Number.isFinite(max) ||
        min < target - margin - 1e-6 || max > target + margin + 1e-6) {
      addIssue(issues, path, "NUTRITION_TARGET_OUTSIDE_TOLERANCE",
        nutrient.key + " falls outside the configured daily range for at least one meal combination.");
    }
  }
}

/**
 * Requires generatedPlanSchema-parsed data and server-owned tool results.
 * The service prepares validationContext once before calling the generator.
 */
export function validateGeneratedPlanForContext({
  generatedPlan, source, toolResults, validationContext,
}) {
  const settings = validationContext;
  const issues = [];
  const training = source.trainingProfile;
  const availability = new Map(training.availableDays.map((entry) => [
    PLAN_WEEKDAYS[entry.day - 1], entry,
  ]));
  const equipment = new Set(getAllowedPlanEquipment(training));
  const catalog = buildAuthorizedCatalog(toolResults);
  const trainingDays = generatedPlan.days.filter((day) => day.workouts.length > 0).length;
  if (trainingDays !== training.trainingDaysPerWeek) {
    addIssue(issues, "days", "TRAINING_DAY_COUNT_MISMATCH",
      "The number of training days must match the profile.");
  }

  const dailyNutrition = [];
  generatedPlan.days.forEach((day, dayIndex) => {
    const path = "days." + dayIndex;
    const available = availability.get(day.dayOfWeek);
    let duration = 0;
    if (day.workouts.length && available?.available !== true) {
      addIssue(issues, path + ".workouts", "TRAINING_DAY_UNAVAILABLE",
        "Workouts must use a day the user marked available.");
    }
    day.workouts.forEach((workout, workoutIndex) => {
      const workoutPath = path + ".workouts." + workoutIndex;
      if (workout.estimatedDurationMinutes === null) {
        addIssue(issues, workoutPath, "WORKOUT_DURATION_REQUIRED",
          "A duration estimate is needed to check available time.");
      } else {
        duration += workout.estimatedDurationMinutes;
        if (workout.estimatedDurationMinutes > training.preferredSessionMinutes) {
          addIssue(issues, workoutPath, "SESSION_DURATION_EXCEEDED",
            "The workout exceeds the preferred session duration.");
        }
      }
      workout.exercises.forEach((prescription, index) => {
        validateExercise(prescription, catalog.exercises.get(prescription.exerciseId.toLowerCase()),
          equipment, workoutPath + ".exercises." + index, issues);
      });
    });
    const dailyLimit = available?.maxMinutes ?? training.preferredSessionMinutes;
    if (duration > dailyLimit) {
      addIssue(issues, path + ".workouts", "DAILY_TRAINING_TIME_EXCEEDED",
        "The combined workouts exceed the day's available minutes.");
    }

    if (GUIDANCE_STYLES.has(settings.style)) {
      if (!day.nutritionGuidance?.trim()) {
        addIssue(issues, path + ".nutritionGuidance", "NUTRITION_GUIDANCE_REQUIRED",
          "This nutrition style requires guidance.");
      }
    }

    const totalsBySlot = new Map();
    // Check ALL slots for ALL styles, including optional meals in guidance
    // plans. Previously those branches could skip item-ID/nutrition checks.
    for (const slot of MEAL_SLOTS) {
      const options = day[slot] ?? [];
      const required = settings.requiredSlots.includes(slot);
      if (settings.concrete) {
        if (!required && options.length > 0) {
          addIssue(issues, path + "." + slot, "UNSCHEDULED_MEAL_SLOT",
            "This meal slot is not scheduled by the user's meal count.");
        }
        if (required && (options.length === 0 ||
            (settings.style === "EXACT_MEALS" && options.length !== 1))) {
          addIssue(issues, path + "." + slot, "MEAL_OPTIONS_REQUIRED",
            "Provide one option for EXACT_MEALS, or at least one for FLEXIBLE_MEALS.");
        }
      }
      totalsBySlot.set(slot, options.map((option, index) =>
        calculateOption(option, catalog, path + "." + slot + "." + index, issues)
      ));
    }

    if (settings.concrete) {
      const primary = emptyNutrition();
      const minimum = emptyNutrition();
      const maximum = emptyNutrition();
      for (const slot of settings.requiredSlots) {
        const options = totalsBySlot.get(slot);
        if (!options.length) continue;
        // One option per slot is eaten. Min/max per nutrient covers EVERY
        // combination of flexible choices without an expensive nested loop.
        for (const { key } of NUTRIENTS) {
          primary[key] += options[0][key];
          minimum[key] += Math.min(...options.map((value) => value[key]));
          maximum[key] += Math.max(...options.map((value) => value[key]));
        }
      }
      checkNutritionRange(minimum, maximum, settings, path, issues);
      dailyNutrition.push({ dayOfWeek: day.dayOfWeek, ...primary });
    }
  });

  if (issues.length) throw new PlanContentInvalidError(issues);
  // Keep calculated totals available for future persistence, but do not treat
  // guidance-only days as zero-calorie days or claim the proposal is saved.
  return { plan: generatedPlan, dailyNutrition, catalog };
}
