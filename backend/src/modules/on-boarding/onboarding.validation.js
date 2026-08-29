import * as z from "zod";

import {
  ACTIVITY_OPTIONS,
  GOAL_OPTIONS,
  ONBOARDING_CONSTRAINTS,
  SEX_OPTIONS,
  UNIT_OPTIONS,
} from "../../config/onboarding.js";
import { invalidSchemaError } from "../../middlewares/errorHandling.js";
import { createPublicErrorDetails } from "../../middlewares/validatebody.js";

const SexSchema = z.enum(SEX_OPTIONS);
const UnitSchema = z.enum(UNIT_OPTIONS);
const ActivityLevelSchema = z.enum(ACTIVITY_OPTIONS);
const GoalTypeSchema = z.enum(GOAL_OPTIONS);

// prisma stores the date as 3 numbers, but validation needs one real Date
// so we can catch impossible values like 31 February.
function birthDateFrom(data) {
  return new Date(Date.UTC(data.birthYear, data.birthMonth - 1, data.birthDay));
}

// Date normally fixes invalid dates by moving them into the next month.
// that is why we compare the result again instead of trusting new Date only.
function isRealBirthDate(data) {
  const date = birthDateFrom(data);

  return (
    date.getUTCFullYear() === data.birthYear &&
    date.getUTCMonth() === data.birthMonth - 1 &&
    date.getUTCDate() === data.birthDay
  );
}

// we need the exact age, not only currentYear - birthYear, because the user's
// birthday may not have happened yet this year.
function calculateAge(date, today = new Date()) {
  let age = today.getUTCFullYear() - date.getUTCFullYear();
  const birthdayHasPassed =
    today.getUTCMonth() > date.getUTCMonth() ||
    (today.getUTCMonth() === date.getUTCMonth() &&
      today.getUTCDate() >= date.getUTCDate());

  if (!birthdayHasPassed) age -= 1;
  return age;
}

// targetDate comes from the frontend as YYYY-MM-DD. this makes sure the text
// represents a real date before the service changes it into a database Date.
function isRealDate(dateString) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === dateString
  );
}

// using the same YYYY-MM-DD format means a string comparison is safe here.
function isFutureDate(dateString) {
  return dateString > new Date().toISOString().slice(0, 10);
}

// ==================== Step 1: about the user ====================
// this step creates or updates the user profile. nothing here is optional
// because these values are needed for fitness calculations.
export const step1Schema = z
  .object({
    // Names belong to User, while the remaining Step 1 fields belong to
    // UserProfile. They are validated together because the frontend saves them
    // as one form and the service persists them in one transaction.
    firstName: z
      .string()
      .trim()
      .min(2, "Enter your first name.")
      .max(40, "First name is too long."),
    lastName: z
      .string()
      .trim()
      .min(2, "Enter your last name.")
      .max(40, "Last name is too long."),
    birthYear: z.number().int("Birth year must be a whole number."),
    birthMonth: z
      .number()
      .int("Birth month must be a whole number.")
      .min(1, "Birth month must be between 1 and 12.")
      .max(12, "Birth month must be between 1 and 12."),
    birthDay: z
      .number()
      .int("Birth day must be a whole number.")
      .min(1, "Birth day must be between 1 and 31.")
      .max(31, "Birth day must be between 1 and 31."),
    adultConfirmed: z.literal(true, {
      error: "You must confirm that you are at least 18.",
    }),
    sexForCalculation: SexSchema,
    preferredUnitSystem: UnitSchema,
    heightCm: z
      .number()
      .min(100, "Height must be between 100 and 250 cm.")
      .max(250, "Height must be between 100 and 250 cm."),
    currentWeightKg: z
      .number()
      .min(30, "Weight must be between 30 and 350 kg.")
      .max(350, "Weight must be between 30 and 350 kg."),
  })
  .strict()
  .superRefine((data, context) => {
    // first we check the complete date, then we calculate the age from it.
    // superRefine lets us point the error at the exact frontend field.
    if (!isRealBirthDate(data)) {
      context.addIssue({
        code: "custom",
        path: ["birthDay"],
        message: "Birth date must be a real date.",
      });
      return;
    }

    const age = calculateAge(birthDateFrom(data));
    if (
      age < ONBOARDING_CONSTRAINTS.minimumAge ||
      age > ONBOARDING_CONSTRAINTS.maximumAge
    ) {
      context.addIssue({
        code: "custom",
        path: ["birthYear"],
        message: "Age must be between 18 and 100.",
      });
    }
  });

// ==================== Step 2: activity and current goal ====================
// targetWeightKg and targetDate are the optional data we talked about.
// nullable + optional means the frontend may send null or omit the key.
export const step2Schema = z
  .object({
    goalType: GoalTypeSchema,
    targetWeightKg: z
      .number()
      .min(30, "Target weight must be between 30 and 350 kg.")
      .max(350, "Target weight must be between 30 and 350 kg.")
      .nullable()
      .optional(),
    targetDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Target date must use YYYY-MM-DD.")
      .refine(isRealDate, { message: "Target date must be a valid date." })
      .refine(isFutureDate, { message: "Target date must be in the future." })
      .nullable()
      .optional(),
    activityLevel: ActivityLevelSchema,
  })
  .strict()
  .superRefine((data, context) => {
    // target weight is only logically required when the goal needs a different
    // weight. Zod cannot express that with one field alone, so we check it here.
    const targetWeightIsRequired = ["LOSE_WEIGHT", "GAIN_WEIGHT"].includes(
      data.goalType
    );

    if (targetWeightIsRequired && data.targetWeightKg == null) {
      context.addIssue({
        code: "custom",
        path: ["targetWeightKg"],
        message: "Target weight is required for this goal.",
      });
    }

    if (data.goalType === "MAINTAIN_WEIGHT" && data.targetWeightKg != null) {
      context.addIssue({
        code: "custom",
        path: ["targetWeightKg"],
        message: "Target weight must be omitted for maintenance goals.",
      });
    }
  });

const STEP_SCHEMAS = {
  1: step1Schema,
  2: step2Schema,
};

// the request body must always have this shape:
// { step: 1 or 2, data: { the fields for that step } }
const saveEnvelopeSchema = z
  .object({
    step: z.number().int(),
    data: z.unknown(),
  })
  .strict();

export function validateOnboardingStep(req, res, next) {
  // validate the outside shape first. this prevents extra top-level fields
  // from silently reaching the controller.
  const envelopeResult = saveEnvelopeSchema.safeParse(req.body);

  if (!envelopeResult.success) {
    throw new invalidSchemaError(
      createPublicErrorDetails(envelopeResult.error)
    );
  }

  const { step, data } = envelopeResult.data;
  const schema = STEP_SCHEMAS[step];

  // step 3 is not accepted here because step 3 has its own /complete route.
  if (!schema) {
    throw new invalidSchemaError([
      { field: "step", message: "Step must be either 1 or 2." },
    ]);
  }

  const dataResult = schema.safeParse(data);
  if (!dataResult.success) {
    throw new invalidSchemaError(createPublicErrorDetails(dataResult.error));
  }

  // only parsed data continues. this is important because Zod now becomes
  // the boundary between an untrusted request and our application logic.
  req.validatedBody = { step, data: dataResult.data };
  return next();
}
