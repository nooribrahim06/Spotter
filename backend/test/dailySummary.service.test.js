import assert from "node:assert/strict";
import { test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  "postgresql://spotter:spotter@localhost:5432/spotter_test";
process.env.FRONTEND_URL = "http://localhost:5173";
process.env.ACCESS_TOKEN_SECRET = Buffer.alloc(32, 7).toString("base64url");
process.env.ACCESS_TOKEN_EXPIRATION = "15m";
process.env.REFRESH_TOKEN_EXPIRATION = "7d";
process.env.SESSION_EXPIRATION = "30d";
process.env.EMAIL_USER = "test@example.com";
process.env.EMAIL_APP_PASSWORD = "test-password";

const { getDailySummary } = await import(
  "../src/modules/daily-summary/dailySummary.service.js"
);

const userId = "11111111-1111-4111-8111-111111111111";
const goalId = "22222222-2222-4222-8222-222222222222";

test("daily summary combines historical targets, meals, and workouts", async () => {
  let mealQuery;
  let workoutQuery;
  let bodyQuery;
  let goalQuery;

  const db = {
    meal: {
      async findMany(args) {
        mealQuery = args;
        return [
          {
            items: [
              {
                calories: "300.00",
                proteinGrams: "20.00",
                carbohydrateGrams: "30.00",
                fatGrams: "10.00",
              },
            ],
          },
          {
            items: [
              {
                calories: "200.00",
                proteinGrams: "10.00",
                carbohydrateGrams: "20.00",
                fatGrams: "5.00",
              },
            ],
          },
        ];
      },
    },
    workout: {
      async findMany(args) {
        workoutQuery = args;
        return [
          { status: "COMPLETED", estimatedCaloriesBurned: 250 },
          { status: "IN_PROGRESS", estimatedCaloriesBurned: null },
        ];
      },
    },
    bodyProfile: {
      async findUnique(args) {
        bodyQuery = args;
        return {
          birthDate: new Date("2000-06-15T00:00:00.000Z"),
          sexForCalculation: "MALE",
          heightCm: "180.00",
          activityLevel: "MODERATELY_ACTIVE",
          progressEntries: [
            {
              weightKg: "80.00",
              recordedAt: new Date("2026-09-10T08:00:00.000Z"),
            },
          ],
        };
      },
    },
    goal: {
      async findFirst(args) {
        goalQuery = args;
        return {
          id: goalId,
          goalType: "LOSE_WEIGHT",
          targetWeightKg: "75.00",
          targetDate: new Date("2026-12-01T00:00:00.000Z"),
          startedAt: new Date("2026-09-01T08:00:00.000Z"),
        };
      },
    },
  };

  const result = await getDailySummary(
    userId,
    "2026-09-11",
    "Africa/Cairo",
    db
  );

  assert.equal(
    mealQuery.where.occurredAt.gte.toISOString(),
    "2026-09-10T21:00:00.000Z"
  );
  assert.equal(
    mealQuery.where.occurredAt.lt.toISOString(),
    "2026-09-11T21:00:00.000Z"
  );
  assert.deepEqual(workoutQuery.where.status.in, ["IN_PROGRESS", "COMPLETED"]);
  assert.equal(
    bodyQuery.select.progressEntries.where.recordedAt.lt.toISOString(),
    "2026-09-11T21:00:00.000Z"
  );
  assert.equal(
    goalQuery.where.startedAt.lt.toISOString(),
    "2026-09-11T21:00:00.000Z"
  );
  assert.equal(result.nutrition.consumedCalories, 500);
  assert.equal(result.nutrition.burnedCalories, 250);
  assert.equal(
    result.nutrition.remainingCalories,
    result.nutrition.targetCalories - 250
  );
  assert.deepEqual(result.nutrition.protein, {
    consumed: 30,
    target: 144,
  });
  assert.equal(result.activity.mealsLogged, 2);
  assert.equal(result.activity.workoutsLogged, 2);
  assert.equal(result.activity.workoutCompleted, true);
  assert.equal(result.targetContext.basedOn.goalId, goalId);
});

test("daily summary remains usable when targets and estimates are unavailable", async () => {
  const db = {
    meal: {
      async findMany() {
        return [
          {
            items: [
              {
                calories: "100.00",
                proteinGrams: null,
                carbohydrateGrams: null,
                fatGrams: null,
              },
            ],
          },
        ];
      },
    },
    workout: {
      async findMany() {
        return [
          { status: "COMPLETED", estimatedCaloriesBurned: null },
        ];
      },
    },
    bodyProfile: {
      async findUnique() {
        return null;
      },
    },
    goal: {
      async findFirst() {
        return null;
      },
    },
  };

  const result = await getDailySummary(
    userId,
    "2026-09-11",
    "UTC",
    db
  );

  assert.equal(result.nutrition.targetCalories, null);
  assert.equal(result.nutrition.consumedCalories, 100);
  assert.equal(result.nutrition.burnedCalories, null);
  assert.equal(result.nutrition.remainingCalories, null);
  assert.equal(result.nutrition.macrosComplete, false);
  assert.equal(result.nutrition.protein.consumed, null);
  assert.equal(result.targetContext, null);
});

test("daily summary requires a saved timezone", async () => {
  await assert.rejects(
    () => getDailySummary(userId, "2026-09-11", null, {}),
    (error) => error.code === "DAILY_SUMMARY_TIMEZONE_REQUIRED"
  );
});
