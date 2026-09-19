import assert from "node:assert/strict";
import { test, after } from "node:test";

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

const { checkPlanActivation } = await import("../src/modules/plans/plan.rules.js");
const { endOwnedActivePlan, discardOwnedDraftPlan } = await import("../src/modules/plans/plan.repository.js");
const { PlanActivationConflictError, PlanStatusConflictError } = await import("../src/middlewares/errorHandling.js");

function createMockSource() {
  const now = new Date();
  return {
    user: { id: "user-1", timezone: "UTC" },
    goal: { id: "goal-1", goalType: "MAINTAIN_WEIGHT", updatedAt: new Date(now.getTime() - 10000) },
    bodyProfile: {
      userId: "user-1",
      birthDate: new Date("1995-01-01"),
      sexForCalculation: "MALE",
      heightCm: 180,
      activityLevel: "MODERATELY_ACTIVE",
      updatedAt: new Date(now.getTime() - 10000),
    },
    latestProgress: {
      recordedAt: new Date(),
      weightKg: 75,
      bodyFatPercentage: 15,
      createdAt: new Date(),
    },
    healthProfile: {
      healthConditions: [],
      movementLimitations: [],
      specialPlanningStates: [],
      requiresProfessionalClearance: false,
      safetyNotes: null,
      updatedAt: new Date(now.getTime() - 10000),
    },
    nutritionProfile: {
      planStyle: "EXACT_MEALS",
      mealsPerDay: 3,
      snacksPerDay: 0,
      dietaryPreferenceCodes: [],
      foodIntolerances: [],
      foodPreferences: [],
      cookingSkill: "INTERMEDIATE",
      foodBudgetLevel: "MEDIUM",
      updatedAt: new Date(now.getTime() - 10000),
    },
    trainingProfile: {
      overallExperienceLevel: "INTERMEDIATE",
      trainingDaysPerWeek: 3,
      availableDays: [
        { dayOfWeek: "MONDAY", available: true },
        { dayOfWeek: "WEDNESDAY", available: true },
        { dayOfWeek: "FRIDAY", available: true },
      ],
      preferredSessionMinutes: 45,
      trainingEnvironment: "COMMERCIAL_GYM",
      availableEquipment: [],
      updatedAt: new Date(now.getTime() - 10000),
    },
  };
}

test("checkPlanActivation rejects if current date is before startDate", () => {
  const source = createMockSource();
  const plan = {
    goalId: "goal-1",
    timezone: "UTC",
    nutritionPlanStyle: "EXACT_MEALS",
    startDate: new Date("2026-10-01T00:00:00.000Z"),
    endDate: new Date("2026-10-31T00:00:00.000Z"),
    createdAt: new Date(),
    calorieTarget: 2500,
    proteinTargetGrams: 150,
    carbohydrateTargetGrams: 300,
    fatTargetGrams: 70,
  };

  const asOfDate = new Date("2026-09-25T12:00:00.000Z");
  assert.throws(
    () => checkPlanActivation(plan, source, asOfDate),
    (err) => err instanceof PlanActivationConflictError && err.code === "PLAN_NOT_STARTED"
  );
});

test("checkPlanActivation rejects if current date is after endDate", () => {
  const source = createMockSource();
  const plan = {
    goalId: "goal-1",
    timezone: "UTC",
    nutritionPlanStyle: "EXACT_MEALS",
    startDate: new Date("2026-10-01T00:00:00.000Z"),
    endDate: new Date("2026-10-15T00:00:00.000Z"),
    createdAt: new Date(),
    calorieTarget: 2500,
    proteinTargetGrams: 150,
    carbohydrateTargetGrams: 300,
    fatTargetGrams: 70,
  };

  const asOfDate = new Date("2026-10-16T12:00:00.000Z");
  assert.throws(
    () => checkPlanActivation(plan, source, asOfDate),
    (err) => err instanceof PlanActivationConflictError && err.code === "PLAN_EXPIRED"
  );
});

test("checkPlanActivation succeeds between startDate and endDate", async () => {
  const source = createMockSource();
  const asOfDate = new Date("2026-10-10T12:00:00.000Z");

  const { calculateFitnessTargets } = await import("../src/modules/profiles/profile.targets.js");
  const expectedTargets = calculateFitnessTargets({
    bodyProfile: source.bodyProfile,
    goal: source.goal,
    progressEntry: source.latestProgress,
    asOfDate,
  });

  const plan = {
    goalId: "goal-1",
    timezone: "UTC",
    nutritionPlanStyle: "EXACT_MEALS",
    startDate: new Date("2026-10-01T00:00:00.000Z"),
    endDate: new Date("2026-10-31T00:00:00.000Z"),
    createdAt: new Date(),
    calorieTarget: expectedTargets.dailyCalories,
    proteinTargetGrams: expectedTargets.proteinGrams,
    carbohydrateTargetGrams: expectedTargets.carbohydrateGrams,
    fatTargetGrams: expectedTargets.fatGrams,
  };

  const targets = checkPlanActivation(plan, source, asOfDate);
  assert.equal(targets.dailyCalories, expectedTargets.dailyCalories);
});

test("endOwnedActivePlan successfully ends an ACTIVE plan", async () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const planId = "22222222-2222-4222-8222-222222222222";

  let updatedData = null;
  const mockDb = {
    $transaction: async (cb) => {
      const tx = {
        $queryRaw: async () => [{ id: userId }],
        plan: {
          findFirst: async () => ({ id: planId, userId, status: "ACTIVE" }),
          update: async ({ data }) => {
            updatedData = data;
            return { id: planId, userId, ...data };
          },
        },
      };
      return cb(tx);
    },
  };

  const result = await endOwnedActivePlan(userId, planId, mockDb);
  assert.equal(result.status, "ENDED");
  assert.ok(result.endedAt instanceof Date);
  assert.equal(updatedData.status, "ENDED");
});

test("endOwnedActivePlan is idempotent if plan is already ENDED", async () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const planId = "22222222-2222-4222-8222-222222222222";
  const originalEndedAt = new Date("2026-09-10T10:00:00.000Z");

  const mockDb = {
    $transaction: async (cb) => {
      const tx = {
        $queryRaw: async () => [{ id: userId }],
        plan: {
          findFirst: async () => ({ id: planId, userId, status: "ENDED", endedAt: originalEndedAt }),
          update: async () => {
            throw new Error("update should not be called");
          },
        },
      };
      return cb(tx);
    },
  };

  const result = await endOwnedActivePlan(userId, planId, mockDb);
  assert.equal(result.status, "ENDED");
  assert.equal(result.endedAt, originalEndedAt);
});

test("endOwnedActivePlan rejects if plan is DRAFT or SUPERSEDED", async () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const planId = "22222222-2222-4222-8222-222222222222";

  for (const status of ["DRAFT", "SUPERSEDED", "DISCARDED"]) {
    const mockDb = {
      $transaction: async (cb) => {
        const tx = {
          $queryRaw: async () => [{ id: userId }],
          plan: {
            findFirst: async () => ({ id: planId, userId, status }),
          },
        };
        return cb(tx);
      },
    };

    await assert.rejects(
      () => endOwnedActivePlan(userId, planId, mockDb),
      (err) => err instanceof PlanStatusConflictError && err.code === "PLAN_NOT_ACTIVE"
    );
  }
});

test("discardOwnedDraftPlan successfully discards a DRAFT plan", async () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const planId = "22222222-2222-4222-8222-222222222222";

  let updatedData = null;
  const mockDb = {
    $transaction: async (cb) => {
      const tx = {
        $queryRaw: async () => [{ id: userId }],
        plan: {
          findFirst: async () => ({ id: planId, userId, status: "DRAFT" }),
          update: async ({ data }) => {
            updatedData = data;
            return { id: planId, userId, ...data };
          },
        },
      };
      return cb(tx);
    },
  };

  const result = await discardOwnedDraftPlan(userId, planId, mockDb);
  assert.equal(result.status, "DISCARDED");
  assert.equal(updatedData.status, "DISCARDED");
});

test("discardOwnedDraftPlan is idempotent if plan is already DISCARDED", async () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const planId = "22222222-2222-4222-8222-222222222222";

  const mockDb = {
    $transaction: async (cb) => {
      const tx = {
        $queryRaw: async () => [{ id: userId }],
        plan: {
          findFirst: async () => ({ id: planId, userId, status: "DISCARDED" }),
          update: async () => {
            throw new Error("update should not be called");
          },
        },
      };
      return cb(tx);
    },
  };

  const result = await discardOwnedDraftPlan(userId, planId, mockDb);
  assert.equal(result.status, "DISCARDED");
});

test("discardOwnedDraftPlan rejects if plan is ACTIVE, ENDED, or SUPERSEDED", async () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const planId = "22222222-2222-4222-8222-222222222222";

  for (const status of ["ACTIVE", "ENDED", "SUPERSEDED"]) {
    const mockDb = {
      $transaction: async (cb) => {
        const tx = {
          $queryRaw: async () => [{ id: userId }],
          plan: {
            findFirst: async () => ({ id: planId, userId, status }),
          },
        };
        return cb(tx);
      },
    };

    await assert.rejects(
      () => discardOwnedDraftPlan(userId, planId, mockDb),
      (err) => err instanceof PlanStatusConflictError && err.code === "PLAN_NOT_DRAFT"
    );
  }
});

after(async () => {
  const { prisma } = await import("../src/lib/prisma.js");
  await prisma.$disconnect();
});

