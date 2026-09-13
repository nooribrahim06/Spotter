import * as z from "zod";

import { WORKOUT_EXERCISE_LIMITS } from "./workoutExercise.rules.js";

// These helpers keep identical numeric rules and error messages across the add
// and update schemas. undefined means "not submitted"; null intentionally clears
// an existing optional value during PATCH.
const optionalPositiveInteger = (label, maximum) =>
  z
    .number()
    .int(`${label} must be a whole number.`)
    .min(1, `${label} must be at least 1.`)
    .max(maximum, `${label} is too large.`)
    .nullable()
    .optional();

function optionalMeasurement(label, maximum, allowZero = false) {
  // finite rejects NaN and Infinity before applying the measurement range.
  const measurement = z
    .number()
    .finite(`${label} must be a finite number.`);
  const positiveMeasurement = allowZero
    ? measurement.min(0, `${label} cannot be negative.`)
    : measurement.gt(0, `${label} must be greater than zero.`);

  return positiveMeasurement
    .max(maximum, `${label} is too large.`)
    .nullable()
    .optional();
}

// WorkoutExercise stores one summary for the exercise, not one row per set.
// Strength exercises use sets/repetitions/weight, while cardio and mobility
// exercises can use duration, distance, or both.
const measurementFields = {
  setsCount: optionalPositiveInteger(
    "Sets",
    WORKOUT_EXERCISE_LIMITS.setsCount
  ),
  repsPerSet: optionalPositiveInteger(
    "Repetitions",
    WORKOUT_EXERCISE_LIMITS.repsPerSet
  ),
  // Zero is valid for bodyweight or unloaded movements. Negative weight is not.
  weightKg: optionalMeasurement(
    "Weight",
    WORKOUT_EXERCISE_LIMITS.weightKg,
    true
  ),
  durationSeconds: optionalPositiveInteger(
    "Duration",
    WORKOUT_EXERCISE_LIMITS.durationSeconds
  ),
  distanceMeters: optionalMeasurement(
    "Distance",
    WORKOUT_EXERCISE_LIMITS.distanceMeters
  ),
  notes: z
    .string()
    .trim()
    .min(1, "Notes cannot be empty.")
    .max(1000, "Notes must be at most 1000 characters.")
    .nullable()
    .optional(),
};

// Adding requires the catalog exercise ID plus a usable measurement combination.
// workoutId comes from the URL; ownership, order, and completion are controlled
// by the server and are rejected by strict().
export const addWorkoutExerciseSchema = z
  .object({
    exerciseId: z.string().uuid("Exercise ID must be a valid UUID."),
    ...measurementFields,
  })
  // Shape and numeric limits belong here. Required/unsupported measurement
  // combinations depend on the selected exercise and are checked by the service
  // after it loads that exercise's trackingMetrics from the database.
  .strict();

// PATCH cannot replace the catalog exercise or change its server-controlled
// order. It may change measurements, notes, or the completion flag.
export const updateWorkoutExerciseSchema = z
  .object({
    ...measurementFields,
    completed: z.boolean().optional(),
  })
  .strict()
  // The route rejects an empty PATCH. Measurement combinations are not checked
  // here because a partial body may depend on stored values. The service merges
  // stored and submitted values, then validates the complete resulting record.
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update.",
  });

// POST /api/workouts/:workoutId/exercises contains only the parent workout ID.
export const workoutExerciseCollectionParamsSchema = z
  .object({
    workoutId: z.string().uuid("Workout ID must be a valid UUID."),
  })
  .strict();

// PATCH and DELETE identify both the parent workout and its nested exercise row.
// Validating both also supports the ownership check performed by the service.
export const workoutExerciseParamsSchema = z
  .object({
    workoutId: z.string().uuid("Workout ID must be a valid UUID."),
    workoutExerciseId: z
      .string()
      .uuid("Workout exercise ID must be a valid UUID."),
  })
  .strict();
