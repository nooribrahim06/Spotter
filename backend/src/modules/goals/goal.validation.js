import * as z from "zod";

import {
  GOAL_OPTIONS,
  ONBOARDING_CONSTRAINTS,
} from "../../config/onboarding.js";

const GoalTypeSchema = z.enum(GOAL_OPTIONS);

function isRealDate(dateString) {
  const date = new Date(dateString + "T00:00:00.000Z");
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === dateString
  );
}

function isFutureDate(dateString) {
  return dateString > new Date().toISOString().slice(0, 10);
}
function atLeastOneField(schema) {
  return schema.refine((data) => Object.keys(data).length > 0, {
    message: "Send at least one field to update.",
  });
}

const TargetDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Target date must use YYYY-MM-DD.")
  .refine(isRealDate, { message: "Target date must be a valid date." })
  .refine(isFutureDate, { message: "Target date must be in the future." })
  .transform((dateString) => new Date(dateString + "T00:00:00.000Z"));

export const goalIdParamSchema = z
  .object({
    goalId: z.string().uuid("Goal ID must be a valid UUID."),
  })
  .strict();

const TargetWeightSchema = z
  .number()
  .min(
    ONBOARDING_CONSTRAINTS.minimumWeightKg,
    "Target weight must be at least " +
      ONBOARDING_CONSTRAINTS.minimumWeightKg +
      " kg."
  )
  .max(
    ONBOARDING_CONSTRAINTS.maximumWeightKg,
    "Target weight must be at most " +
      ONBOARDING_CONSTRAINTS.maximumWeightKg +
      " kg."
  )
  .nullable()
  .optional();

export const createGoalSchema = z
  .object({
    goalType: GoalTypeSchema,
    targetWeightKg: TargetWeightSchema,
    targetDate: TargetDateSchema.nullable().optional(),
  })
  .strict()
  .superRefine((data, context) => {
    if (
      ["LOSE_WEIGHT", "GAIN_WEIGHT"].includes(data.goalType) &&
      data.targetWeightKg == null
    ) {
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




export const updateGoalSchema = atLeastOneField(
  z
    .object({
      goalType: GoalTypeSchema.optional(),
      targetWeightKg: TargetWeightSchema,
      targetDate: TargetDateSchema.nullable().optional(),
    })
    .strict()
);
