import assert from "node:assert/strict";
import { test } from "node:test";

Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://spotter:spotter@localhost:5432/spotter_test",
  FRONTEND_URL: "http://localhost:5173",
  ACCESS_TOKEN_SECRET: Buffer.alloc(32, 1).toString("base64url"),
  EMAIL_USER: "test@example.com",
  EMAIL_APP_PASSWORD: "test-password",
  CLOUD_NAME: "test",
  CLOUD_API_KEY: "test",
  CLOUD_API_SECRET: "test",
  GROQ_API_KEY: "test",
  GROQ_MODEL_NAME: "test",
});

const { getDailySummary } = await import("../src/modules/daily-summary/dailySummary.service.js");

const userId = "11111111-1111-4111-8111-111111111111";

function mockActivityAndProfileDb(plan = null) {
  return {
    meal: {
      findMany: async () => [
        {
          id: "m-1",
          items: [{
            calories: 600,
            proteinGrams: 40,
            carbohydrateGrams: 60,
            fatGrams: 20,
          }],
        },
      ],
    },
    workout: {
      findMany: async () => [
        {
          id: "w-1",
          status: "COMPLETED",
          estimatedCaloriesBurned: 300,
        },
      ],
    },
    bodyProfile: {
      findUnique: async () => ({
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
      }),
    },
    goal: {
      findFirst: async () => ({
        id: "goal-1",
        userId,
        goalType: "LOSE_WEIGHT",
        targetWeightKg: "75.00",
        targetDate: new Date("2026-12-01T00:00:00.000Z"),
        startedAt: new Date("2026-09-01T08:00:00.000Z"),
      }),
    },
    plan: {
      findFirst: async () => plan,
    },
  };
}

test("daily summary prioritizes active plan targets and labels source as PLAN", async () => {
  const activePlan = {
    id: "plan-active-1",
    title: "Cut 2026",
    status: "ACTIVE",
    timezone: "Africa/Cairo",
    calorieTarget: 1850,
    proteinTargetGrams: 160,
    carbohydrateTargetGrams: 175,
    fatTargetGrams: 55,
    startDate: new Date("2026-10-01T00:00:00Z"),
    endDate: new Date("2026-10-31T00:00:00Z"),
  };

  const db = mockActivityAndProfileDb(activePlan);

  const summary = await getDailySummary(userId, "2026-10-05", "Africa/Cairo", db);

  // Target calories should be plan target (1850), not recalculated profile target
  assert.equal(summary.nutrition.targetCalories, 1850);
  assert.equal(summary.nutrition.protein.target, 160);
  assert.equal(summary.nutrition.carbohydrates.target, 175);
  assert.equal(summary.nutrition.fat.target, 55);

  // Remaining: 1850 target - 600 consumed + 300 burned = 1550
  assert.equal(summary.nutrition.remainingCalories, 1550);

  // Context should be labelled as PLAN
  assert.equal(summary.targetContext.source, "PLAN");
  assert.equal(summary.targetContext.planId, "plan-active-1");
  assert.equal(summary.targetContext.planTitle, "Cut 2026");
  assert.ok(summary.targetContext.profileTargets, "Profile targets should be retained in context");
  assert.notEqual(summary.targetContext.profileTargets.dailyCalories, 1850);
});

test("daily summary falls back to profile targets when no plan covers date", async () => {
  const db = mockActivityAndProfileDb(null); // No plan

  const summary = await getDailySummary(userId, "2026-10-05", "Africa/Cairo", db);

  assert.ok(summary.nutrition.targetCalories > 0);
  assert.equal(summary.targetContext.source, "PROFILE");
  assert.equal(summary.targetContext.planId, null);
});
