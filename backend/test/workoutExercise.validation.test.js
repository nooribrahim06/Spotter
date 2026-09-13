import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addWorkoutExerciseSchema,
  updateWorkoutExerciseSchema,
  workoutExerciseParamsSchema,
} from "../src/modules/workout-exercises/workoutExercise.validate.js";

const exerciseId = "44444444-4444-4444-8444-444444444444";

test("a repetition-based workout exercise is valid", () => {
  const result = addWorkoutExerciseSchema.safeParse({
    exerciseId,
    setsCount: 3,
    repsPerSet: 10,
    weightKg: 40,
    notes: "  Controlled repetitions  ",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.notes, "Controlled repetitions");
});

test("a duration or distance workout exercise is valid", () => {
  assert.equal(
    addWorkoutExerciseSchema.safeParse({
      exerciseId,
      durationSeconds: 1200,
      distanceMeters: 5000,
    }).success,
    true
  );
});

test("catalog-dependent measurement combinations are deferred to the service", () => {
  assert.equal(
    addWorkoutExerciseSchema.safeParse({ exerciseId }).success,
    true
  );
  assert.equal(
    addWorkoutExerciseSchema.safeParse({
      exerciseId,
      setsCount: 3,
    }).success,
    true
  );
  assert.equal(
    addWorkoutExerciseSchema.safeParse({
      exerciseId,
      weightKg: 40,
    }).success,
    true
  );
});

test("workout-exercise measurements enforce safe limits", () => {
  assert.equal(
    addWorkoutExerciseSchema.safeParse({
      exerciseId,
      setsCount: 0,
      repsPerSet: 10,
    }).success,
    false
  );
  assert.equal(
    addWorkoutExerciseSchema.safeParse({
      exerciseId,
      durationSeconds: 86401,
    }).success,
    false
  );
  assert.equal(
    addWorkoutExerciseSchema.safeParse({
      exerciseId,
      distanceMeters: -1,
    }).success,
    false
  );
});

test("clients cannot control workout ownership, order, or completion on add", () => {
  const result = addWorkoutExerciseSchema.safeParse({
    exerciseId,
    workoutId: "11111111-1111-4111-8111-111111111111",
    exerciseOrder: 10,
    completed: true,
    durationSeconds: 60,
  });

  assert.equal(result.success, false);
});

test("a patch requires an editable field and cannot replace the exercise", () => {
  assert.equal(updateWorkoutExerciseSchema.safeParse({}).success, false);
  assert.equal(
    updateWorkoutExerciseSchema.safeParse({ completed: true }).success,
    true
  );
  assert.equal(
    updateWorkoutExerciseSchema.safeParse({ exerciseId }).success,
    false
  );
});

test("nested workout-exercise parameters require UUIDs", () => {
  const valid = workoutExerciseParamsSchema.safeParse({
    workoutId: "22222222-2222-4222-8222-222222222222",
    workoutExerciseId: "33333333-3333-4333-8333-333333333333",
  });
  const invalid = workoutExerciseParamsSchema.safeParse({
    workoutId: "bad-id",
    workoutExerciseId: "bad-id",
  });

  assert.equal(valid.success, true);
  assert.equal(invalid.success, false);
});
