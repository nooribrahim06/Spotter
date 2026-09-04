import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createWorkoutSchema,
  workoutHistoryQuerySchema,
  workoutIdParamSchema,
} from "../src/modules/workouts/workout.validate.js";

test("workout creation accepts an empty body", () => {
  const result = createWorkoutSchema.safeParse({});

  assert.equal(result.success, true);
});

test("workout creation trims text and converts startedAt to Date", () => {
  const result = createWorkoutSchema.safeParse({
    name: "  Push Day  ",
    notes: "  Chest and shoulders  ",
    startedAt: "2026-09-03T18:00:00+03:00",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.name, "Push Day");
  assert.equal(result.data.notes, "Chest and shoulders");
  assert.ok(result.data.startedAt instanceof Date);
});

test("workout creation rejects server-controlled fields", () => {
  const result = createWorkoutSchema.safeParse({
    userId: "11111111-1111-4111-8111-111111111111",
    status: "COMPLETED",
  });

  assert.equal(result.success, false);
});

test("workout ID params require a UUID", () => {
  assert.equal(
    workoutIdParamSchema.safeParse({ workoutId: "not-a-uuid" }).success,
    false
  );
});

test("workout history query converts dates and pagination", () => {
  const result = workoutHistoryQuerySchema.safeParse({
    from: "2026-09-01T00:00:00+03:00",
    to: "2026-09-30T23:59:59+03:00",
    page: "2",
    limit: "10",
  });

  assert.equal(result.success, true);
  assert.ok(result.data.from instanceof Date);
  assert.ok(result.data.to instanceof Date);
  assert.equal(result.data.page, 2);
  assert.equal(result.data.limit, 10);
});

test("workout history rejects a reversed date range", () => {
  const result = workoutHistoryQuerySchema.safeParse({
    from: "2026-09-30T00:00:00+03:00",
    to: "2026-09-01T00:00:00+03:00",
  });

  assert.equal(result.success, false);
});
