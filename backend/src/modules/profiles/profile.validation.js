import * as z from "zod";

import {
  PROFILE_CONSTRAINTS,
  PROFILE_OPTIONS,
} from "../../config/profile.js";

/*
 * Validation is the trust boundary of the profile module.
 *
 * Everything arriving from the frontend is untrusted. A schema answers three
 * questions before the controller is allowed to call the service:
 * - Is this field part of this specific action?
 * - Is its type and value safe for the database and business rules?
 * - Should a missing value mean "leave unchanged", while null means "clear it"?
 *
 * Every object is strict. This is important: without .strict(), a request could
 * silently include role, timestamps, ownership IDs, or a field intended for a
 * different profile section. We want an explicit 400 response instead.
 */

const optionalDisplayText = (maximum) =>
  z.string().trim().max(maximum).nullable();

function isRealDateOnly(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function calculateAge(date, today = new Date()) {
  let age = today.getUTCFullYear() - date.getUTCFullYear();
  const birthdayHasPassed =
    today.getUTCMonth() > date.getUTCMonth() ||
    (today.getUTCMonth() === date.getUTCMonth() &&
      today.getUTCDate() >= date.getUTCDate());
  if (!birthdayHasPassed) age -= 1;
  return age;
}

const birthDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Birth date must use YYYY-MM-DD.")
  .refine(isRealDateOnly, "Birth date must be a real date.")
  .refine((value) => {
    const age = calculateAge(new Date(`${value}T00:00:00.000Z`));
    return (
      age >= PROFILE_CONSTRAINTS.minimumAge &&
      age <= PROFILE_CONSTRAINTS.maximumAge
    );
  }, "Age must be between 18 and 100.");

function atLeastOneField(schema) {
  return schema.refine((data) => Object.keys(data).length > 0, {
    message: "Send at least one field to update.",
  });
}

/*
 * PATCH schemas use optional properties because PATCH means "change only these
 * fields." A missing property is preserved. For nullable fields, sending null
 * explicitly clears the saved value. The extra refinement prevents an empty
 * object from pretending that an update happened.
 */
export const publicProfileUpdateSchema = atLeastOneField(
  z
    .object({
      firstName: z.string().trim().min(2).max(40).optional(),
      lastName: z.string().trim().min(2).max(40).optional(),
      displayName: optionalDisplayText(50).optional(),
      bio: optionalDisplayText(500).optional(),
    })
    .strict()
);

function isIanaTimezone(value) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export const accountPreferencesUpdateSchema = atLeastOneField(
  z
    .object({
      language: z
        .string()
        .trim()
        .min(2)
        .max(10)
        .regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/)
        .transform((value) => value.toLowerCase())
        .optional(),
      country: z
        .string()
        .trim()
        .length(2)
        .regex(/^[A-Za-z]{2}$/)
        .transform((value) => value.toUpperCase())
        .nullable()
        .optional(),
      timezone: z
        .string()
        .trim()
        .min(1)
        .max(64)
        .refine(isIanaTimezone, "Timezone must be a valid IANA timezone.")
        .nullable()
        .optional(),
    })
    .strict()
);

/*
 * BodyProfile stores canonical metric values even when the user prefers
 * imperial display. Conversion belongs at the API/UI edge; one storage unit
 * prevents formulas from mixing pounds with kilograms or inches with cm.
 *
 * Creation accepts startingWeightKg exactly once. The update schema below does
 * not contain that property, which makes the onboarding baseline immutable.
 * Later weight changes must create ProgressEntry history.
 */
export const createBodyProfileSchema = z
  .object({
    birthDate: birthDateSchema,
    adultConfirmed: z.literal(true, {
      error: "You must confirm that you are at least 18.",
    }),
    sexForCalculation: z.enum(PROFILE_OPTIONS.sexForCalculation),
    preferredUnitSystem: z.enum(PROFILE_OPTIONS.unitSystems),
    heightCm: z
      .number()
      .min(PROFILE_CONSTRAINTS.heightCm.min)
      .max(PROFILE_CONSTRAINTS.heightCm.max),
    startingWeightKg: z
      .number()
      .min(PROFILE_CONSTRAINTS.weightKg.min)
      .max(PROFILE_CONSTRAINTS.weightKg.max),
    activityLevel: z.enum(PROFILE_OPTIONS.activityLevels),
  })
  .strict();

export const updateBodyProfileSchema = atLeastOneField(
  z
    .object({
      birthDate: birthDateSchema.optional(),
      sexForCalculation: z
        .enum(PROFILE_OPTIONS.sexForCalculation)
        .optional(),
      preferredUnitSystem: z.enum(PROFILE_OPTIONS.unitSystems).optional(),
      heightCm: z
        .number()
        .min(PROFILE_CONSTRAINTS.heightCm.min)
        .max(PROFILE_CONSTRAINTS.heightCm.max)
        .optional(),
      activityLevel: z.enum(PROFILE_OPTIONS.activityLevels).optional(),
    })
    .strict()
);

/*
 * Some plan-generation inputs are JSON because their detailed taxonomy will
 * grow faster than the relational schema. "Flexible JSON" does not mean
 * unvalidated JSON: each object still has a strict bounded shape, bounded text,
 * and a normalized uppercase code.
 */
const codeSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Z0-9_\-]+$/, "Use an uppercase code such as LOWER_BACK_PAIN.");

const healthConditionSchema = z
  .object({
    code: codeSchema,
    notes: optionalDisplayText(500).optional(),
    active: z.boolean().default(true),
  })
  .strict();

const movementLimitationSchema = z
  .object({
    bodyRegion: codeSchema,
    trigger: codeSchema,
    notes: optionalDisplayText(500).optional(),
  })
  .strict();

const specialPlanningStateSchema = z
  .object({
    code: codeSchema,
    notes: optionalDisplayText(500).optional(),
  })
  .strict();

export const healthProfileSchema = z
  .object({
    healthConditions: z.array(healthConditionSchema).max(30),
    movementLimitations: z.array(movementLimitationSchema).max(30),
    specialPlanningStates: z.array(specialPlanningStateSchema).max(20),
    safetyNotes: optionalDisplayText(2000),
  })
  .strict();

/*
 * PUT section schemas intentionally require every top-level field. PUT means
 * "this is the complete new version of the section," so the server should not
 * guess whether an omitted array means keep the old answers or clear them.
 *
 * Use [] for a completed answer with no items and null for an optional scalar
 * that has no value. requiresProfessionalClearance is absent on purpose because
 * the service derives that safety result from the submitted health information.
 */
const foodAllergySchema = z
  .object({
    code: codeSchema,
    severity: z.enum(["MILD", "MODERATE", "SEVERE"]).nullable(),
    notes: optionalDisplayText(500),
  })
  .strict();

const foodIntoleranceSchema = z
  .object({
    code: codeSchema,
    notes: optionalDisplayText(500),
  })
  .strict();

const foodPreferenceSchema = z
  .object({
    food: z.string().trim().min(1).max(100),
    preference: z.enum(["LIKE", "DISLIKE", "AVOID"]),
  })
  .strict();

export const nutritionProfileSchema = z
  .object({
    dietaryPreferenceCodes: z.array(codeSchema).max(30),
    foodAllergies: z.array(foodAllergySchema).max(50),
    foodIntolerances: z.array(foodIntoleranceSchema).max(50),
    foodPreferences: z.array(foodPreferenceSchema).max(100),
    mealsPerDay: z.number().int().min(1).max(10).nullable(),
    snacksPerDay: z.number().int().min(0).max(10).nullable(),
    planStyle: z.enum(PROFILE_OPTIONS.nutritionPlanStyles).nullable(),
    cookingSkill: z.enum(PROFILE_OPTIONS.cookingSkills).nullable(),
    maxMealPrepMinutes: z.number().int().min(0).max(480).nullable(),
    kitchenAccess: z.enum(PROFILE_OPTIONS.kitchenAccess).nullable(),
    foodBudgetLevel: z.enum(PROFILE_OPTIONS.foodBudgetLevels).nullable(),
  })
  .strict();

// availableDays and equipment are nested, but strict child schemas maintain the
// same mass-assignment protection as the top-level request.
const availableDaySchema = z
  .object({
    day: z.number().int().min(1).max(7),
    available: z.boolean(),
    preferred: z.boolean().optional(),
    maxMinutes: z.number().int().min(5).max(300).nullable().optional(),
  })
  .strict();

const equipmentSchema = z
  .object({
    code: codeSchema,
    quantity: z.number().int().min(1).max(100).nullable(),
    maxWeightKg: z.number().min(0).max(1000).nullable(),
  })
  .strict();

export const trainingProfileSchema = z
  .object({
    overallExperienceLevel: z
      .enum(PROFILE_OPTIONS.trainingExperienceLevels)
      .nullable(),
    resistanceTrainingLevel: z
      .enum(PROFILE_OPTIONS.trainingExperienceLevels)
      .nullable(),
    cardioTrainingLevel: z
      .enum(PROFILE_OPTIONS.trainingExperienceLevels)
      .nullable(),
    currentlyTrainingConsistently: z.boolean().nullable(),
    trainingDaysPerWeek: z.number().int().min(0).max(7).nullable(),
    availableDays: z.array(availableDaySchema).max(7),
    preferredSessionMinutes: z.number().int().min(5).max(300).nullable(),
    trainingEnvironment: z
      .enum(PROFILE_OPTIONS.trainingEnvironments)
      .nullable(),
    availableEquipment: z.array(equipmentSchema).max(100),
    preferredTrainingStyles: z.array(codeSchema).max(30),
    preferredCardioType: optionalDisplayText(100),
    averageSleepMinutes: z.number().int().min(0).max(1440).nullable(),
    sleepQuality: z.number().int().min(1).max(10).nullable(),
    typicalStressLevel: z.number().int().min(1).max(10).nullable(),
  })
  .strict()
  .superRefine((data, context) => {
    // Cross-field rules cannot be expressed by validating one property alone.
    // Duplicated weekdays are ambiguous, and planned training days cannot exceed
    // the days the user actually marked available.
    const dayNumbers = data.availableDays.map((item) => item.day);
    if (new Set(dayNumbers).size !== dayNumbers.length) {
      context.addIssue({
        code: "custom",
        path: ["availableDays"],
        message: "Each day may appear only once.",
      });
    }

    const availableCount = data.availableDays.filter(
      (item) => item.available
    ).length;
    if (
      data.trainingDaysPerWeek != null &&
      data.trainingDaysPerWeek > availableCount
    ) {
      context.addIssue({
        code: "custom",
        path: ["trainingDaysPerWeek"],
        message: "Training days cannot exceed the available days.",
      });
    }
  });

export const coachingPreferencesSchema = z
  .object({
    coachingStyle: z.enum(PROFILE_OPTIONS.coachingStyles),
    explanationLevel: z.enum(PROFILE_OPTIONS.explanationLevels),
    motivationStyle: z.enum(PROFILE_OPTIONS.motivationStyles).nullable(),
    checkinFrequency: z.enum(PROFILE_OPTIONS.checkinFrequencies).nullable(),
    proactiveCoaching: z.boolean(),
    workoutReminders: z.boolean(),
    nutritionReminders: z.boolean(),
  })
  .strict();

/*
 * Progress is append-only through this module. The required weight creates the
 * new current body state, while optional device/body-composition readings add
 * context. A measurement type may appear once per check-in because the database
 * has the same uniqueness rule.
 */
const progressMeasurementSchema = z
  .object({
    measurementType: z.enum(PROFILE_OPTIONS.bodyMeasurementTypes),
    valueCm: z
      .number()
      .min(PROFILE_CONSTRAINTS.measurementCm.min)
      .max(PROFILE_CONSTRAINTS.measurementCm.max),
  })
  .strict();

export const createProgressEntrySchema = z
  .object({
    weightKg: z
      .number()
      .min(PROFILE_CONSTRAINTS.weightKg.min)
      .max(PROFILE_CONSTRAINTS.weightKg.max),
    bodyFatPercentage: z
      .number()
      .min(PROFILE_CONSTRAINTS.bodyFatPercentage.min)
      .max(PROFILE_CONSTRAINTS.bodyFatPercentage.max)
      .nullable()
      .optional(),
    skeletalMuscleMassKg: z.number().min(5).max(200).nullable().optional(),
    restingHeartRateBpm: z
      .number()
      .int()
      .min(PROFILE_CONSTRAINTS.restingHeartRateBpm.min)
      .max(PROFILE_CONSTRAINTS.restingHeartRateBpm.max)
      .nullable()
      .optional(),
    measurements: z.array(progressMeasurementSchema).max(14).default([]),
    notes: optionalDisplayText(1000).optional(),
  })
  .strict()
  .superRefine((data, context) => {
    const types = data.measurements.map((item) => item.measurementType);
    if (new Set(types).size !== types.length) {
      context.addIssue({
        code: "custom",
        path: ["measurements"],
        message: "Each measurement type may appear only once.",
      });
    }
  });

export const deleteBodyProfileSchema = z
  .object({
    password: z.string().min(1).max(128),
  })
  .strict();
