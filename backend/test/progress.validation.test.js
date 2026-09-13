import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createProgressSchema,
  progressEntryParamsSchema,
  progressHistoryQuerySchema,
} from "../src/modules/progress/progress.validate.js";

test("progress creation accepts measurements and converts recordedAt", () => {
  const result = createProgressSchema.safeParse({
    weightKg: 82.4,
    recordedAt: "2026-09-10T20:00:00+03:00",
    bodyFatPercentage: 20.5,
    measurements: [
      { measurementType: "WAIST", valueCm: 86.2 },
    ],
  });

  assert.equal(result.success, true);
  assert.ok(result.data.recordedAt instanceof Date);
});

test("progress creation rejects ownership and duplicate measurements", () => {
  const ownership = createProgressSchema.safeParse({
    weightKg: 82,
    goalId: "11111111-1111-4111-8111-111111111111",
  });
  const duplicate = createProgressSchema.safeParse({
    weightKg: 82,
    measurements: [
      { measurementType: "WAIST", valueCm: 85 },
      { measurementType: "WAIST", valueCm: 84.5 },
    ],
  });

  assert.equal(ownership.success, false);
  assert.equal(duplicate.success, false);
  assert.ok(
    duplicate.error.issues.some(
      (issue) => issue.path.at(-1) === "measurementType"
    )
  );
});

test("progress creation rejects future dates and impossible muscle mass", () => {
  const future = createProgressSchema.safeParse({
    weightKg: 80,
    recordedAt: "2999-01-01T00:00:00Z",
  });
  const muscleMass = createProgressSchema.safeParse({
    weightKg: 70,
    skeletalMuscleMassKg: 71,
  });

  assert.equal(future.success, false);
  assert.equal(muscleMass.success, false);
});

test("progress history supplies pagination defaults and validates its range", () => {
  const defaults = progressHistoryQuerySchema.safeParse({});
  const reversed = progressHistoryQuerySchema.safeParse({
    startDate: "2026-09-12",
    endDate: "2026-09-11",
  });

  assert.equal(defaults.success, true);
  assert.deepEqual(defaults.data, { page: 1, limit: 20 });
  assert.equal(reversed.success, false);
});

test("progress entry params require a UUID", () => {
  assert.equal(
    progressEntryParamsSchema.safeParse({ entryId: "not-a-uuid" }).success,
    false
  );
});
