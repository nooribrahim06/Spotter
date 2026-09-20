import assert from "node:assert/strict";
import { test } from "node:test";
import { formatInTimeZone } from "date-fns-tz";

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

const { startWorkoutFromPlan } = await import("../src/modules/workouts/workout.service.js");
const { startWorkoutFromPlanSchema } = await import("../src/modules/workouts/workout.validate.js");

const userId = "11111111-1111-4111-8111-111111111111";
const planWorkoutId = "22222222-2222-4222-8222-222222222222";
const exerciseId = "33333333-3333-4333-8333-333333333333";
const timezone = "Africa/Cairo";

function mockPlanWorkout(planOverrides = {}, workoutOverrides = {}) {
  const today = formatInTimeZone(new Date(), timezone, "yyyy-MM-dd");
  return {
    id: planWorkoutId,
    name: "Push Day",
    exercises: [
      { exerciseId, setsCount: 3, repMin: 8, repMax: 10, notes: "RPE 8" },
    ],
    planDay: {
      plan: {
        id: "plan-1",
        userId,
        status: "ACTIVE",
        timezone,
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2026-12-31T00:00:00Z"),
        ...planOverrides,
      },
    },
    ...workoutOverrides,
  };
}

test("startWorkoutFromPlanSchema validates inputs strictly", () => {
  const valid = startWorkoutFromPlanSchema.safeParse({
    planWorkoutId,
    scheduledDate: "2026-10-05",
  });
  assert.equal(valid.success, true);

  const invalidUuid = startWorkoutFromPlanSchema.safeParse({
    planWorkoutId: "bad-id",
    scheduledDate: "2026-10-05",
  });
  assert.equal(invalidUuid.success, false);

  const invalidDate = startWorkoutFromPlanSchema.safeParse({
    planWorkoutId,
    scheduledDate: "not-a-date",
  });
  assert.equal(invalidDate.success, false);
});

test("startWorkoutFromPlan rejects if planWorkout does not exist or user is not owner", async () => {
  const today = formatInTimeZone(new Date(), timezone, "yyyy-MM-dd");
  const mockDb = {
    planWorkout: { findFirst: async () => null },
  };

  await assert.rejects(
    () => startWorkoutFromPlan(userId, { planWorkoutId, scheduledDate: today }, mockDb),
    { code: "PLAN_NOT_FOUND" }
  );
});

test("startWorkoutFromPlan rejects if plan is not ACTIVE", async () => {
  const today = formatInTimeZone(new Date(), timezone, "yyyy-MM-dd");
  const mockDb = {
    planWorkout: { findFirst: async () => mockPlanWorkout({ status: "DRAFT" }) },
  };

  await assert.rejects(
    () => startWorkoutFromPlan(userId, { planWorkoutId, scheduledDate: today }, mockDb),
    { code: "PLAN_NOT_ACTIVE" }
  );
});

test("startWorkoutFromPlan rejects if scheduledDate is not today in plan timezone", async () => {
  const mockDb = {
    planWorkout: { findFirst: async () => mockPlanWorkout() },
  };

  await assert.rejects(
    () => startWorkoutFromPlan(userId, { planWorkoutId, scheduledDate: "2026-01-02" }, mockDb),
    { code: "PLAN_SCHEDULE_MISMATCH" }
  );
});

test("startWorkoutFromPlan rejects if occurrence was already COMPLETED", async () => {
  const today = formatInTimeZone(new Date(), timezone, "yyyy-MM-dd");
  const mockDb = {
    planWorkout: { findFirst: async () => mockPlanWorkout() },
    workout: {
      findFirst: async () => ({
        id: "completed-workout",
        status: "COMPLETED",
        exercises: [],
      }),
    },
  };

  await assert.rejects(
    () => startWorkoutFromPlan(userId, { planWorkoutId, scheduledDate: today }, mockDb),
    { code: "PLAN_OCCURRENCE_COMPLETED" }
  );
});

test("startWorkoutFromPlan idempotently resumes existing IN_PROGRESS occurrence", async () => {
  const today = formatInTimeZone(new Date(), timezone, "yyyy-MM-dd");
  const inProgressWorkout = {
    id: "in-progress-workout",
    name: "Push Day",
    status: "IN_PROGRESS",
    startedAt: new Date(),
    completedAt: null,
    durationMinutes: null,
    estimatedCaloriesBurned: null,
    notes: null,
    exercises: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockDb = {
    planWorkout: { findFirst: async () => mockPlanWorkout() },
    workout: {
      findFirst: async () => inProgressWorkout,
    },
  };

  const result = await startWorkoutFromPlan(userId, { planWorkoutId, scheduledDate: today }, mockDb);
  assert.equal(result.isExisting, true);
  assert.equal(result.workout.id, "in-progress-workout");
});

test("startWorkoutFromPlan rejects if another unrelated workout is currently in progress", async () => {
  const today = formatInTimeZone(new Date(), timezone, "yyyy-MM-dd");
  let queryCount = 0;
  const mockDb = {
    planWorkout: { findFirst: async () => mockPlanWorkout() },
    workout: {
      findFirst: async () => {
        queryCount++;
        // First query checks scheduled occurrence (none), second checks active workout (exists)
        return queryCount === 1 ? null : { id: "other-active-workout", status: "IN_PROGRESS" };
      },
    },
  };

  await assert.rejects(
    () => startWorkoutFromPlan(userId, { planWorkoutId, scheduledDate: today }, mockDb),
    { code: "ACTIVE_WORKOUT_EXISTS" }
  );
});

test("startWorkoutFromPlan creates a new workout with copied prescriptions", async () => {
  const today = formatInTimeZone(new Date(), timezone, "yyyy-MM-dd");
  let createdData = null;

  const mockDb = {
    planWorkout: { findFirst: async () => mockPlanWorkout() },
    workout: {
      findFirst: async () => null, // No existing occurrence, no active workout
      create: async ({ data }) => {
        createdData = data;
        return {
          id: "new-workout-1",
          name: data.name,
          status: data.status,
          startedAt: data.startedAt,
          completedAt: null,
          durationMinutes: null,
          estimatedCaloriesBurned: null,
          notes: null,
          exercises: data.exercises.create.map((ex, i) => ({
            id: `we-${i}`,
            workoutId: "new-workout-1",
            exerciseId: ex.exerciseId,
            exerciseOrder: ex.exerciseOrder,
            notes: ex.notes,
            completed: ex.completed,
            exercise: { id: ex.exerciseId, name: "Barbell Bench Press" },
          })),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
    },
  };

  const result = await startWorkoutFromPlan(userId, { planWorkoutId, scheduledDate: today }, mockDb);

  assert.equal(result.isExisting, false);
  assert.equal(result.workout.id, "new-workout-1");
  assert.equal(result.workout.status, "IN_PROGRESS");
  assert.equal(createdData.sourcePlanWorkoutId, planWorkoutId);
  assert.equal(createdData.exercises.create[0].exerciseId, exerciseId);
  assert.equal(createdData.exercises.create[0].completed, false);
  assert.equal(createdData.exercises.create[0].exerciseOrder, 1);
});

test("startWorkoutFromPlan rejects if planWorkout weekday does not match today's weekday", async () => {
  const { getWeekdayForDate } = await import("../src/modules/plans/plan.rules.js");
  const today = formatInTimeZone(new Date(), timezone, "yyyy-MM-dd");
  const todayWeekday = getWeekdayForDate(today);
  const differentWeekday = todayWeekday === "MONDAY" ? "TUESDAY" : "MONDAY";

  const mismatchWorkout = mockPlanWorkout({}, {
    planDay: {
      dayOfWeek: differentWeekday,
      plan: {
        id: "plan-1",
        userId,
        status: "ACTIVE",
        timezone,
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2026-12-31T00:00:00Z"),
      },
    },
  });

  const mockDb = {
    planWorkout: { findFirst: async () => mismatchWorkout },
    workout: { findFirst: async () => null },
  };

  await assert.rejects(
    () => startWorkoutFromPlan(userId, { planWorkoutId, scheduledDate: today }, mockDb),
    { code: "PLAN_SCHEDULE_MISMATCH" }
  );
});

test("startWorkoutFromPlan rejects if scheduledDate falls before plan activation date", async () => {
  const today = formatInTimeZone(new Date(), timezone, "yyyy-MM-dd");
  const futureActivation = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const mockDb = {
    planWorkout: {
      findFirst: async () => mockPlanWorkout({
        activatedAt: futureActivation,
      }),
    },
    workout: { findFirst: async () => null },
  };

  await assert.rejects(
    () => startWorkoutFromPlan(userId, { planWorkoutId, scheduledDate: today }, mockDb),
    { code: "PLAN_SCHEDULE_MISMATCH" }
  );
});
