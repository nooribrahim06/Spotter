import assert from "node:assert/strict";
import { test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  "postgresql://spotter:spotter@localhost:5432/spotter_test";
process.env.FRONTEND_URL = "http://localhost:5173";
process.env.ACCESS_TOKEN_SECRET = Buffer.alloc(32, 2).toString("base64url");
process.env.ACCESS_TOKEN_EXPIRATION = "15m";
process.env.REFRESH_TOKEN_EXPIRATION = "7d";
process.env.SESSION_EXPIRATION = "30d";
process.env.EMAIL_USER = "test@example.com";
process.env.EMAIL_APP_PASSWORD = "test-password";

const { activateGoal, createGoal } = await import(
  "../src/modules/goals/goal.service.js"
);

const userId = "11111111-1111-4111-8111-111111111111";
const goalId = "22222222-2222-4222-8222-222222222222";
const timestamp = new Date("2026-09-01T08:00:00.000Z");

function goalRecord(overrides = {}) {
  return {
    id: goalId,
    userId,
    goalType: "IMPROVE_FITNESS",
    targetWeightKg: null,
    targetDate: null,
    status: "DRAFT",
    isOnboardingGoal: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

test("saving a regular goal creates a history-safe draft", async () => {
  let savedData;
  const db = {
    goal: {
      async create({ data }) {
        savedData = data;
        return goalRecord(data);
      },
    },
  };

  const result = await createGoal(
    userId,
    {
      goalType: "IMPROVE_FITNESS",
      targetWeightKg: null,
      targetDate: null,
    },
    db
  );

  assert.equal(savedData.status, "DRAFT");
  assert.equal(savedData.isOnboardingGoal, null);
  assert.equal(result.status, "DRAFT");
  assert.equal("userId" in result, false);
  assert.equal("isOnboardingGoal" in result, false);
});

test("activation conflict keeps the saved goal as a draft", async () => {
  let updateCalled = false;
  const draft = goalRecord();
  const db = {
    goal: {
      async findFirst({ where }) {
        return where.id ? draft : goalRecord({ id: "active", status: "ACTIVE" });
      },
      async update() {
        updateCalled = true;
      },
    },
  };

  await assert.rejects(
    activateGoal(userId, goalId, db),
    (error) => error.code === "ACTIVE_GOAL_EXISTS" && error.statusCode === 409
  );
  assert.equal(updateCalled, false);
  assert.equal(draft.status, "DRAFT");
});

test("activation marks a draft active and sets its start time", async () => {
  const draft = goalRecord();
  const db = {
    goal: {
      async findFirst({ where }) {
        return where.id ? draft : null;
      },
      async update({ data }) {
        return goalRecord({
          ...data,
          status: "ACTIVE",
        });
      },
    },
  };

  const result = await activateGoal(userId, goalId, db);

  assert.equal(result.status, "ACTIVE");
  assert.ok(result.startedAt instanceof Date);
});

test("the database race safeguard returns the same activation conflict", async () => {
  const db = {
    goal: {
      async findFirst({ where }) {
        return where.id ? goalRecord() : null;
      },
      async update() {
        throw { code: "P2002" };
      },
    },
  };

  await assert.rejects(
    activateGoal(userId, goalId, db),
    (error) => error.code === "ACTIVE_GOAL_EXISTS" && error.statusCode === 409
  );
});
