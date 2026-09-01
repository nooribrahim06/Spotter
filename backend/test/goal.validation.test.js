import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createGoalSchema,
  goalIdParamSchema,
  updateGoalSchema,
} from "../src/modules/goals/goal.validation.js";

test("goal creation accepts canonical JSON and converts the date", () => {
  const result = createGoalSchema.safeParse({
    goalType: "LOSE_WEIGHT",
    targetWeightKg: 75,
    targetDate: "2099-12-01",
  });

  assert.equal(result.success, true);
  assert.ok(result.data.targetDate instanceof Date);
  assert.equal(result.data.targetDate.toISOString(), "2099-12-01T00:00:00.000Z");
});

test("goal creation gets ownership from authentication, not the body", () => {
  const result = createGoalSchema.safeParse({
    userId: "11111111-1111-4111-8111-111111111111",
    goalType: "IMPROVE_FITNESS",
  });

  assert.equal(result.success, false);
  assert.ok(
    result.error.issues.some(
      (issue) =>
        issue.code === "unrecognized_keys" &&
        issue.keys.includes("userId")
    )
  );
});

test("weight-changing goals require a target weight", () => {
  const result = createGoalSchema.safeParse({
    goalType: "GAIN_WEIGHT",
    targetDate: null,
  });

  assert.equal(result.success, false);
  assert.ok(
    result.error.issues.some(
      (issue) => issue.path.join(".") === "targetWeightKg"
    )
  );
});

test("maintenance goals reject a different target weight", () => {
  const result = createGoalSchema.safeParse({
    goalType: "MAINTAIN_WEIGHT",
    targetWeightKg: 80,
  });

  assert.equal(result.success, false);
});

test("goal IDs must be UUIDs", () => {
  assert.equal(
    goalIdParamSchema.safeParse({ goalId: "not-a-uuid" }).success,
    false
  );
});

test("draft updates may change goal type and related target fields", () => {
  const result = updateGoalSchema.safeParse({
    goalType: "GAIN_WEIGHT",
    targetWeightKg: 90,
    targetDate: "2099-12-01",
  });

  assert.equal(result.success, true);
  assert.ok(result.data.targetDate instanceof Date);
});

test("draft updates require at least one editable field", () => {
  assert.equal(updateGoalSchema.safeParse({}).success, false);
  assert.equal(
    updateGoalSchema.safeParse({ status: "ACTIVE" }).success,
    false
  );
});
