import { z } from "zod";

/**
 * SUMMARY: validates fields/types, IDs as UUIDs, limits, seven unique weekdays,
 * rep ranges, exercise measurements, and duplicate exercises within a workout.
 * It does not verify real catalog IDs, permissions, schedule, or nutrition;
 * plan-generated.rules.js owns those checks. The generator runs this once.
 *
 * START HERE: this file checks the shape of the plan returned by the AI.
 * It does not call the AI, calculate targets, or save anything to the database.
 *
 * Think of it as a checklist: does the plan contain the right fields and values?
 * The backend will use it like this:
 *
 *   const result = generatedPlanSchema.safeParse(aiOutput);
 *   if (!result.success) {
 *     // result.error.issues lists the invalid fields. Stop before saving.
 *   } else {
 *     // result.data is the parsed content. Check business rules, then save.
 *   }
 *
 * HOW THE PIECES FIT:
 *   Plan -> 7 days -> workouts -> exercise prescriptions
 *                 -> meal options -> food/recipe items
 *
 * A breakfast OPTION is one possible breakfast.
 * The ITEMS inside it are the foods/recipes eaten together for that option.
 * Example: option A = a recipe + fruit; option B = a different recipe.
 * These are alternatives. Do not add option A and option B's calories together.
 *
 *
 * Read the sections below from small pieces up to the whole plan.
 */

// 1. SHARED LIMITS: maximum text/list sizes, not fitness recommendations.
// Object.freeze prevents these settings from being changed at runtime.
// User-specific limits (such as available workout time) are checked later.
export const PLAN_CONTENT_LIMITS = Object.freeze({
  titleLength: 160,
  explanationLength: 4000,
  notesLength: 1000,
  guidanceLength: 2000,
  optionLabelLength: 100,
  mealOptionsPerSlot: 5,
  itemsPerMealOption: 20,
  workoutsPerDay: 3,
  exercisesPerWorkout: 20,
  smallIntMax: 32767, // Largest positive database SmallInt value.
});

// 2. ALLOWED SCHEDULE VALUES
// A repeating week. Start/end dates and timezone are attached by the backend.
export const PLAN_WEEKDAYS = Object.freeze([
  "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY",
  "FRIDAY", "SATURDAY", "SUNDAY",
]);

export const dayOfWeekSchema = z.enum(PLAN_WEEKDAYS);
// Broad time preference, not an exact appointment time.
export const workoutSlotSchema = z.enum([
  "MORNING", "AFTERNOON", "EVENING", "ANYTIME",
]);

// Shared rules. notes: null means no note; omitting notes fails validation.
const notesSchema = z.string().trim().max(PLAN_CONTENT_LIMITS.notesLength).nullable();
const positiveInteger = z.number().int().positive();
// 3. ONE MEAL ITEM
// discriminatedUnion uses itemType to choose which object shape is allowed.
// RECIPE requires recipeId + servings. FOOD requires foodId + quantityGrams.
// strict() rejects mixing the shapes, such as adding servings to a FOOD item.
// Fractional portions are allowed, such as 1.5 servings or 125.5 grams.
// uuid() checks ID format only. The service must check the item exists,
// is accessible, fits restrictions, and calculate nutrients from catalog data.
export const mealItemSchema = z.discriminatedUnion("itemType", [
  z.object({
    itemType: z.literal("RECIPE"),
    recipeId: z.string().uuid(),
    servings: z.number().positive(),
  }).strict(),
  z.object({
    itemType: z.literal("FOOD"),
    foodId: z.string().uuid(),
    quantityGrams: z.number().positive(),
  }).strict(),
]);

// 4. ONE COMPLETE MEAL CHOICE
// Example shape (replace placeholders with real catalog UUIDs):
// {
//   label: "Breakfast",
//   items: [
//     { itemType: "RECIPE", recipeId: "<recipe UUID>", servings: 1 },
//     { itemType: "FOOD", foodId: "<food UUID>", quantityGrams: 150 }
//   ],
//   note: null
// }
// A choice needs at least one item. The backend later assigns its option ID.
export const mealOptionSchema = z.object({
  label: z.string().trim().min(1).max(PLAN_CONTENT_LIMITS.optionLabelLength),
  items: z.array(mealItemSchema).min(1).max(PLAN_CONTENT_LIMITS.itemsPerMealOption),
  note: notesSchema,
}).strict();

// 5. ONE PLANNED EXERCISE
// This describes what to perform. It does not record completed activity.
// Example: setsCount: 3, repMin: 8, repMax: 10 means 3 sets of 8-10 reps.
// All fields are required; use null for measurements that do not apply.
// For a timed exercise, use durationSeconds and set both rep limits to null.
// The service later checks which measurements the catalog exercise supports.
export const exercisePrescriptionSchema = z.object({
  exerciseId: z.string().uuid(),
  // Number of sets; null for an activity that does not use sets.
  setsCount: positiveInteger.nullable(),
  // Minimum and maximum repetitions. Provide both, or set both to null.
  repMin: positiveInteger.nullable(),
  repMax: positiveInteger.nullable(),
  // Suggested load: zero is allowed; null means no numeric load supplied.
  weightKg: z.number().nonnegative().nullable(),
  // Planned duration or distance, where appropriate for the exercise.
  durationSeconds: positiveInteger.nullable(),
  distanceMeters: z.number().positive().nullable(),
  // Zero means no rest; null means no numeric rest duration supplied.
  restSeconds: z.number().int().nonnegative().nullable(),
  notes: notesSchema,
}).strict().superRefine((exercise, ctx) => {
  // ctx.addIssue adds an error. path identifies the field needing attention.
  // These booleans track whether each end of the rep range was provided.
  const hasRepMin = exercise.repMin !== null;
  const hasRepMax = exercise.repMax !== null;

  // Reject a half-filled range, such as repMin: 8 and repMax: null.
  if (hasRepMin !== hasRepMax) {
    ctx.addIssue({
      code: "custom",
      path: [hasRepMin ? "repMax" : "repMin"],
      message: "Provide both rep limits or set both to null.",
    });
  } else if (hasRepMin && exercise.repMin > exercise.repMax) {
    // Reject a reversed range such as 12-8. Equal limits (8-8) are valid.
    ctx.addIssue({
      code: "custom",
      path: ["repMax"],
      message: "repMax must be greater than or equal to repMin.",
    });
  }

  // At least reps, duration, or distance must describe how much to perform.
  // An exercise ID with only sets or notes is not enough.
  if (!hasRepMin && !hasRepMax &&
      exercise.durationSeconds === null && exercise.distanceMeters === null) {
    ctx.addIssue({
      code: "custom",
      path: ["durationSeconds"],
      message: "Provide a rep range, duration, or distance for the exercise.",
    });
  }
});

// 6. ONE WORKOUT SESSION
// Contains one or more exercises. Duration is planned time, not time performed.
// Null duration passes this shape check; the service must require it when
// needed to validate user availability or activation rules.
// Array order gives display order. The backend assigns workout orderIndex.
export const workoutSchema = z.object({
  slot: workoutSlotSchema,
  name: z.string().trim().min(1).max(PLAN_CONTENT_LIMITS.titleLength),
  estimatedDurationMinutes: positiveInteger.max(PLAN_CONTENT_LIMITS.smallIntMax).nullable(),
  exercises: z.array(exercisePrescriptionSchema)
    .min(1).max(PLAN_CONTENT_LIMITS.exercisesPerWorkout),
  notes: notesSchema,
}).strict().superRefine((workout, ctx) => {
  // A Set remembers IDs already encountered. Duplicate IDs are rejected
  // because actual workouts allow each exercise only once per workout.
  // Reusing an exercise in a different workout or day is allowed.
  const seen = new Set();
  workout.exercises.forEach((exercise, index) => {
    // Uppercase/lowercase letters do not make a UUID a different ID.
    const id = exercise.exerciseId.toLowerCase();
    if (seen.has(id)) {
      ctx.addIssue({
        code: "custom",
        path: ["exercises", index, "exerciseId"],
        message: "An exercise may appear only once in a workout.",
      });
    }
    seen.add(id);
  });
});

// 7. OPTIONS FOR ONE MEAL SLOT (for example, breakfast)
// null = no options supplied; [] = an explicitly empty options list.
// Both are allowed structurally. The service checks what the style requires:
// EXACT_MEALS needs a primary choice for each scheduled meal slot.
// FLEXIBLE_MEALS can offer alternatives. MACRO_BASED and SIMPLE_GUIDANCE
// can use guidance and targets without concrete meal choices.
const mealOptionsSchema = z.array(mealOptionSchema)
  .max(PLAN_CONTENT_LIMITS.mealOptionsPerSlot).nullable();

// 8. ONE WEEKDAY
// A rest day can still contain meals and nutrition guidance.
export const planDaySchema = z.object({
  dayOfWeek: dayOfWeekSchema,
  breakfastOptions: mealOptionsSchema,
  lunchOptions: mealOptionsSchema,
  dinnerOptions: mealOptionsSchema,
  snackOptions: mealOptionsSchema,
  nutritionGuidance: z.string().trim().max(PLAN_CONTENT_LIMITS.guidanceLength).nullable(),
  notes: notesSchema,
  // An empty array explicitly represents a rest day.
  workouts: z.preprocess(
  (value) => {
    if (!Array.isArray(value)) {
      return value;
    }

    const isRestDay =
      value.length > 0 &&
      value.every(
        (workout) =>
          workout &&
          typeof workout === "object" &&
          typeof workout.name === "string" &&
          workout.name.trim().toUpperCase() === "REST"
      );

    return isRestDay ? [] : value;
  },
  z.array(workoutSchema)
    .max(PLAN_CONTENT_LIMITS.workoutsPerDay)
),
}).strict();

// 9. THE COMPLETE PLAN: use this schema to validate the entire AI response.
// Seven days + allowed weekday names + no duplicates = a complete week.
// Weekdays may arrive in any order.
//
// The AI supplies existing catalog IDs inside meal items and exercises.
// The backend creates new plan/day/workout/prescription/option IDs, resolves
// catalog names and nutrients, and assigns owner, dates, timezone, targets,
// orderIndex and lifecycle status. These extra fields are not accepted here.
//
// AFTER THIS SCHEMA PASSES, the service still checks catalog access, exercise
// tracking metrics, nutrition style/targets, equipment, availability,
// restrictions, and relevant context changes before saving a DRAFT.
export const generatedPlanSchema = z.object({
  title: z.string().trim().min(1).max(PLAN_CONTENT_LIMITS.titleLength),
  explanation: z.string().trim().min(1).max(PLAN_CONTENT_LIMITS.explanationLength),
  days: z.array(planDaySchema).length(7).superRefine((days, ctx) => {
    // length(7) alone would allow seven Mondays. Remember each weekday
    // and report duplicates at their position in the days array.
    const seen = new Set();
    days.forEach((day, index) => {
      if (seen.has(day.dayOfWeek)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "dayOfWeek"],
          message: "The plan must contain each weekday exactly once.",
        });
      }
      seen.add(day.dayOfWeek);
    });
  }),
}).strict();
