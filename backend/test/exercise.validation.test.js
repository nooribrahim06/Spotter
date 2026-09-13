import assert from "node:assert/strict";
import { test } from "node:test";

import {
  exerciseIdParamSchema,
  listExercisesQuerySchema,
} from "../src/modules/exercises/exercise.validate.js";

test("exercise list query supplies safe pagination defaults", () => {
  const result = listExercisesQuerySchema.safeParse({});

  assert.equal(result.success, true);
  assert.deepEqual(result.data, { page: 1, limit: 20 });
});

test("exercise list query trims search and accepts every filter", () => {
  const result = listExercisesQuerySchema.safeParse({
    search: "  press  ",
    exerciseType: "STRENGTH",
    bodyPart: "CHEST",
    difficulty: "BEGINNER",
    force: "PUSH",
    mechanic: "COMPOUND",
    equipment: "BODY_WEIGHT",
    page: "2",
    limit: "10",
  });

  assert.equal(result.success, true);
  assert.deepEqual(result.data, {
    search: "press",
    exerciseType: "STRENGTH",
    bodyPart: "CHEST",
    difficulty: "BEGINNER",
    force: "PUSH",
    mechanic: "COMPOUND",
    equipment: "BODY_WEIGHT",
    page: 2,
    limit: 10,
  });
});

test("exercise list query rejects invalid filters and unknown fields", () => {
  assert.equal(
    listExercisesQuerySchema.safeParse({ exerciseType: "POWER" }).success,
    false
  );
  assert.equal(
    listExercisesQuerySchema.safeParse({ page: 0 }).success,
    false
  );
  assert.equal(
    listExercisesQuerySchema.safeParse({ limit: 51 }).success,
    false
  );
  assert.equal(
    listExercisesQuerySchema.safeParse({ isActive: "false" }).success,
    false
  );
});

test("exercise ID params require a UUID", () => {
  assert.equal(
    exerciseIdParamSchema.safeParse({ exerciseId: "not-a-uuid" }).success,
    false
  );
});
