import assert from "node:assert/strict";
import { test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  "postgresql://spotter:spotter@localhost:5432/spotter_test";
process.env.FRONTEND_URL = "http://localhost:5173";
process.env.ACCESS_TOKEN_SECRET = Buffer.alloc(32, 6).toString("base64url");
process.env.ACCESS_TOKEN_EXPIRATION = "15m";
process.env.REFRESH_TOKEN_EXPIRATION = "7d";
process.env.SESSION_EXPIRATION = "30d";
process.env.EMAIL_USER = "test@example.com";
process.env.EMAIL_APP_PASSWORD = "test-password";

const {
  createProgressEntry,
  getGoalProgress,
  getProgressEntryById,
  getProgressHistory,
  getLatestProgressEntry,
} = await import("../src/modules/progress/progress.service.js");

const userId = "11111111-1111-4111-8111-111111111111";
const goalId = "22222222-2222-4222-8222-222222222222";
const entryId = "33333333-3333-4333-8333-333333333333";
const startEntryId = "44444444-4444-4444-8444-444444444444";
const recordedAt = new Date("2026-09-11T08:00:00.000Z");
const createdAt = new Date("2026-09-11T08:01:00.000Z");

function progressRecord(overrides = {}) {
  return {
    id: entryId,
    bodyProfileId: userId,
    goalId,
    recordedAt,
    weightKg: "84.00",
    bodyFatPercentage: "20.50",
    skeletalMuscleMassKg: null,
    restingHeartRateBpm: 62,
    notes: null,
    isInitialForGoal: null,
    createdAt,
    measurements: [
      { measurementType: "WAIST", valueCm: "85.20" },
    ],
    ...overrides,
  };
}

test("progress creation requires a body profile and links only the active goal", async () => {
  let createQuery;
  const db = {
    bodyProfile: {
      async findUnique() {
        return { userId };
      },
    },
    goal: {
      async findFirst() {
        return { id: goalId, status: "ACTIVE" };
      },
    },
    progressEntry: {
      async findFirst() {
        return progressRecord({ recordedAt: new Date("2026-09-10T08:00:00Z") });
      },
      async create(args) {
        createQuery = args;
        return progressRecord(args.data);
      },
    },
  };

  const result = await createProgressEntry(
    { weightKg: 84, recordedAt },
    userId,
    db
  );

  assert.equal(createQuery.data.bodyProfileId, userId);
  assert.equal(createQuery.data.goalId, goalId);
  assert.equal(result.weightKg, 84);
  assert.equal(Object.hasOwn(result, "bodyProfileId"), false);
});

test("progress creation fails clearly when the body profile is missing", async () => {
  const db = {
    bodyProfile: {
      async findUnique() {
        return null;
      },
    },
  };

  await assert.rejects(
    () => createProgressEntry({ weightKg: 84 }, userId, db),
    (error) => error.code === "BODY_PROFILE_NOT_FOUND"
  );
});

test("progress creation rejects a check-in older than the latest entry", async () => {
  const db = {
    bodyProfile: {
      async findUnique() {
        return { userId };
      },
    },
    progressEntry: {
      async findFirst() {
        return progressRecord({ recordedAt });
      },
    },
  };

  await assert.rejects(
    () =>
      createProgressEntry(
        { weightKg: 84, recordedAt: new Date("2026-09-10T08:00:00Z") },
        userId,
        db
      ),
    (error) => error.code === "INVALID_PROGRESS_DATE"
  );
});

test("progress history uses the user's local calendar dates", async () => {
  let historyQuery;
  const db = {
    progressEntry: {
      async findMany(args) {
        historyQuery = args;
        return [];
      },
      async count() {
        return 0;
      },
    },
  };

  const result = await getProgressHistory(
    userId,
    {
      page: 1,
      limit: 20,
      startDate: "2026-09-11",
      endDate: "2026-09-11",
    },
    "Africa/Cairo",
    db
  );

  assert.equal(
    historyQuery.where.recordedAt.gte.toISOString(),
    "2026-09-10T21:00:00.000Z"
  );
  assert.equal(
    historyQuery.where.recordedAt.lt.toISOString(),
    "2026-09-11T21:00:00.000Z"
  );
  assert.equal(result.pagination.totalPages, 0);
});

test("progress history requires a saved timezone when filtering by date", async () => {
  await assert.rejects(
    () =>
      getProgressHistory(
        userId,
        { page: 1, limit: 20, startDate: "2026-09-11" },
        null,
        {}
      ),
    (error) => error.code === "PROGRESS_TIMEZONE_REQUIRED"
  );
});

test("latest progress returns null and detail lookup remains owner-scoped", async () => {
  const emptyDb = {
    progressEntry: {
      async findFirst() {
        return null;
      },
    },
  };

  assert.equal(await getLatestProgressEntry(userId, emptyDb), null);
  await assert.rejects(
    () => getProgressEntryById(userId, entryId, emptyDb),
    (error) => error.code === "PROGRESS_ENTRY_NOT_FOUND"
  );
});

test("goal progress calculates start, change, remaining, and percentage", async () => {
  const activeGoal = {
    id: goalId,
    goalType: "LOSE_WEIGHT",
    targetWeightKg: "80.00",
    targetDate: new Date("2026-12-01T00:00:00Z"),
    startedAt: new Date("2026-09-01T08:00:00Z"),
  };
  const startingEntry = progressRecord({
    id: startEntryId,
    weightKg: "90.00",
    recordedAt: new Date("2026-09-01T08:00:00Z"),
    isInitialForGoal: true,
  });
  const currentEntry = progressRecord({ weightKg: "84.00" });
  const db = {
    goal: {
      async findFirst() {
        return activeGoal;
      },
    },
    progressEntry: {
      async findFirst(args) {
        return args.where.goalId ? startingEntry : currentEntry;
      },
    },
  };

  const result = await getGoalProgress(userId, db);

  assert.equal(result.starting.weightKg, 90);
  assert.equal(result.current.weightKg, 84);
  assert.equal(result.weightChangeKg, -6);
  assert.equal(result.remainingKg, 4);
  assert.equal(result.progressPercentage, 60);
});

test("goal progress requires an active goal", async () => {
  const db = {
    goal: {
      async findFirst() {
        return null;
      },
    },
  };

  await assert.rejects(
    () => getGoalProgress(userId, db),
    (error) => error.code === "ACTIVE_GOAL_REQUIRED"
  );
});
