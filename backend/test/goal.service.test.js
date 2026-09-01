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

const {
  activateGoal,
  createGoal,
  getActiveGoal,
  getAllGoals,
  getGoalById,
} = await import(
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

test("goal history is owned, newest-first, and serialized", async () => {
  let query;
  const db = {
    goal: {
      async findMany(args) {
        query = args;
        return [
          goalRecord({
            id: "33333333-3333-4333-8333-333333333333",
            targetWeightKg: "75.50",
            targetDate: new Date("2099-12-01T00:00:00.000Z"),
            status: "COMPLETED",
          }),
          goalRecord(),
        ];
      },
    },
  };

  const result = await getAllGoals(userId, db);

  assert.deepEqual(query, {
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  assert.equal(result.length, 2);
  assert.equal(result[0].targetWeightKg, 75.5);
  assert.equal(result[0].targetDate, "2099-12-01");
  assert.equal("userId" in result[0], false);
});

test("active goal includes the user's latest progress entry", async () => {
  let progressQuery;
  const db = {
    goal: {
      async findFirst() {
        return goalRecord({ status: "ACTIVE", startedAt: timestamp });
      },
    },
    progressEntry: {
      async findFirst(args) {
        progressQuery = args;
        return {
          id: "44444444-4444-4444-8444-444444444444",
          recordedAt: timestamp,
          weightKg: "81.25",
          bodyFatPercentage: "18.50",
          skeletalMuscleMassKg: null,
          restingHeartRateBpm: 60,
          notes: null,
          measurements: [
            {
              measurementType: "WAIST",
              valueCm: "84.50",
            },
          ],
        };
      },
    },
  };

  const result = await getActiveGoal(userId, db);

  assert.deepEqual(progressQuery.where, { bodyProfileId: userId });
  assert.deepEqual(progressQuery.orderBy, [
    { recordedAt: "desc" },
    { createdAt: "desc" },
  ]);
  assert.equal(result.status, "ACTIVE");
  assert.equal(result.currentProgress.weightKg, 81.25);
  assert.equal(result.currentProgress.measurements[0].valueCm, 84.5);
});

test("no active goal is a normal null response", async () => {
  let progressQueried = false;
  const db = {
    goal: {
      async findFirst() {
        return null;
      },
    },
    progressEntry: {
      async findFirst() {
        progressQueried = true;
      },
    },
  };

  const result = await getActiveGoal(userId, db);

  assert.equal(result, null);
  assert.equal(progressQueried, false);
});

test("goal lookup requires matching ownership", async () => {
  let query;
  const db = {
    goal: {
      async findFirst(args) {
        query = args;
        return null;
      },
    },
  };

  await assert.rejects(
    getGoalById(userId, goalId, db),
    (error) => error.code === "GOAL_NOT_FOUND" && error.statusCode === 404
  );
  assert.deepEqual(query.where, { id: goalId, userId });
});
