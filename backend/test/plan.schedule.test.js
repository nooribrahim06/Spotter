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

const { getWeekdayForDate, getPlanDayForWeekday } = await import("../src/modules/plans/plan.rules.js");
const { getDailySchedule } = await import("../src/modules/plans/plan.service.js");
const { planScheduleQuerySchema } = await import("../src/modules/plans/plan.validate.js");
const { findPlanForDate, isPlanInEffectOnDate } = await import("../src/modules/plans/plan.repository.js");

const userId = "11111111-1111-4111-8111-111111111111";

test("getWeekdayForDate calculates exact uppercase weekday for calendar date and timezone", () => {
  // 2026-10-05 is a Monday
  assert.equal(getWeekdayForDate("2026-10-05", "Africa/Cairo"), "MONDAY");
  // 2026-10-06 is a Tuesday
  assert.equal(getWeekdayForDate("2026-10-06", "Africa/Cairo"), "TUESDAY");
  // 2026-10-11 is a Sunday
  assert.equal(getWeekdayForDate("2026-10-11", "Africa/Cairo"), "SUNDAY");
  // Extreme timezones (UTC+14 and UTC-11) must not shift the calendar day
  assert.equal(getWeekdayForDate("2026-10-05", "Pacific/Kiritimati"), "MONDAY");
  assert.equal(getWeekdayForDate("2026-10-05", "Pacific/Pago_Pago"), "MONDAY");
});

test("getPlanDayForWeekday extracts the day corresponding to the requested weekday", () => {
  const plan = {
    days: [
      { id: "day-mon", dayOfWeek: "MONDAY", notes: "Chest day" },
      { id: "day-tue", dayOfWeek: "TUESDAY", notes: "Leg day" },
    ],
  };

  assert.equal(getPlanDayForWeekday(plan, "MONDAY")?.id, "day-mon");
  assert.equal(getPlanDayForWeekday(plan, "TUESDAY")?.id, "day-tue");
  assert.equal(getPlanDayForWeekday(plan, "WEDNESDAY"), null);
  assert.equal(getPlanDayForWeekday(null, "MONDAY"), null);
});

test("planScheduleQuerySchema validates YYYY-MM-DD calendar dates strictly", () => {
  const valid = planScheduleQuerySchema.safeParse({ date: "2026-10-05" });
  assert.equal(valid.success, true);
  assert.equal(valid.data.date, "2026-10-05");

  const invalidFormat = planScheduleQuerySchema.safeParse({ date: "10-05-2026" });
  assert.equal(invalidFormat.success, false);

  const invalidDate = planScheduleQuerySchema.safeParse({ date: "2026-02-31" });
  assert.equal(invalidDate.success, false);
});

test("getDailySchedule returns null plan and day if no plan covers requested date", async () => {
  const mockDb = {
    plan: {
      findFirst: async () => null,
    },
  };

  const schedule = await getDailySchedule(userId, "2026-10-05", mockDb);
  assert.deepEqual(schedule, { plan: null, day: null });
});

test("getDailySchedule returns prescribed plan day and metadata for covered date", async () => {
  const mockDb = {
    plan: {
      findFirst: async () => ({
        id: "plan-123",
        userId,
        title: "Active Hypertrophy Plan",
        timezone: "Africa/Cairo",
        status: "ACTIVE",
        startDate: new Date("2026-10-01T00:00:00Z"),
        endDate: new Date("2026-10-31T00:00:00Z"),
        days: [
          {
            id: "day-mon",
            dayOfWeek: "MONDAY",
            breakfastOptions: [{ label: "Oatmeal", items: [] }],
            lunchOptions: null,
            dinnerOptions: null,
            snackOptions: null,
            workouts: [{ id: "w-1", name: "Upper Body", exercises: [] }],
          },
          {
            id: "day-tue",
            dayOfWeek: "TUESDAY",
            breakfastOptions: null,
            lunchOptions: null,
            dinnerOptions: null,
            snackOptions: null,
            workouts: [],
          },
        ],
      }),
    },
  };

  // 2026-10-05 is a Monday
  const schedule = await getDailySchedule(userId, "2026-10-05", mockDb);

  assert.ok(schedule.plan);
  assert.equal(schedule.plan.id, "plan-123");
  assert.equal(schedule.plan.title, "Active Hypertrophy Plan");
  assert.equal(schedule.plan.timezone, "Africa/Cairo");
  assert.equal(schedule.plan.status, "ACTIVE");

  assert.ok(schedule.day);
  assert.equal(schedule.day.id, "day-mon");
  assert.equal(schedule.day.dayOfWeek, "MONDAY");
  assert.equal(schedule.day.breakfastOptions[0].label, "Oatmeal");
  assert.equal(schedule.day.workouts[0].name, "Upper Body");
});

test("isPlanInEffectOnDate accurately validates activation and termination intervals", () => {
  const plan = {
    timezone: "UTC",
    status: "ENDED",
    startDate: new Date("2026-10-01T00:00:00Z"),
    endDate: new Date("2026-10-31T00:00:00Z"),
    activatedAt: new Date("2026-10-03T10:00:00Z"),
    endedAt: new Date("2026-10-15T18:00:00Z"),
  };

  // Before scheduled start
  assert.equal(isPlanInEffectOnDate(plan, "2026-09-30"), false);
  // After scheduled end
  assert.equal(isPlanInEffectOnDate(plan, "2026-11-01"), false);
  // Within scheduled dates but before activation
  assert.equal(isPlanInEffectOnDate(plan, "2026-10-02"), false);
  // Within active interval
  assert.equal(isPlanInEffectOnDate(plan, "2026-10-05"), true);
  // On activation date
  assert.equal(isPlanInEffectOnDate(plan, "2026-10-03"), true);
  // On termination date
  assert.equal(isPlanInEffectOnDate(plan, "2026-10-15"), true);
  // After termination date (early exit)
  assert.equal(isPlanInEffectOnDate(plan, "2026-10-16"), false);
});

test("findPlanForDate excludes plans that were not in effect on the requested date", async () => {
  // Plan A was scheduled for all of October, but ended early on Oct 10
  const endedEarlyPlan = {
    id: "plan-ended-early",
    userId,
    status: "ENDED",
    timezone: "UTC",
    startDate: new Date("2026-10-01T00:00:00Z"),
    endDate: new Date("2026-10-31T00:00:00Z"),
    activatedAt: new Date("2026-10-01T00:00:00Z"),
    endedAt: new Date("2026-10-10T12:00:00Z"),
  };

  const mockDb = {
    plan: {
      findMany: async () => [endedEarlyPlan],
    },
  };

  // When querying Oct 15, the plan was NOT in effect
  const resultAfter = await findPlanForDate(userId, "2026-10-15", mockDb);
  assert.equal(resultAfter, null);

  // When querying Oct 05, the plan WAS in effect
  const resultDuring = await findPlanForDate(userId, "2026-10-05", mockDb);
  assert.ok(resultDuring);
  assert.equal(resultDuring.id, "plan-ended-early");
});
