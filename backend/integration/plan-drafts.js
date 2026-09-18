// Explicit integration suite: creates unique fixtures, then deletes only those fixtures.
// Run against a dedicated test database: npm run test:plans-db
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import pg from "pg";
import { prisma } from "../src/lib/prisma.js";
import { getPlanGenerationSourceData } from "../src/modules/plans/plan.repository.js";
import { saveDraftIfUnchanged } from "../src/modules/plans/plan.repository.js";
import { buildDraftInput, persistGeneratedDraft } from "../src/modules/plans/plan.service.js";

const userId = randomUUID();
const exerciseId = randomUUID();
const editor = new pg.Client({ connectionString: process.env.DATABASE_URL });
let generation;

before(async () => {
  await editor.connect();
  await editor.query("SET lock_timeout = '300ms'");
  await prisma.user.create({ data: {
    id: userId, email: `${userId}@example.test`, username: userId.slice(0, 25),
    passwordHash: "integration-only", timezone: "Africa/Cairo",
    bodyProfile: { create: {
      birthDate: new Date("1995-01-01"), adultConfirmedAt: new Date(), sexForCalculation: "FEMALE",
      preferredUnitSystem: "METRIC", heightCm: 165, startingWeightKg: 65,
      nutritionProfile: { create: { planStyle: "MACRO_BASED" } },
    } },
    goals: { create: { goalType: "IMPROVE_FITNESS", status: "ACTIVE" } },
  } });
  await prisma.exercise.create({ data: {
    id: exerciseId, slug: exerciseId, name: "Draft integration exercise",
    exerciseType: "STRENGTH", bodyPart: "LEGS", difficulty: "BEGINNER", equipment: "BODY_WEIGHT",
  } });
  const source = await getPlanGenerationSourceData(userId);
  generation = {
    userId, source, template: null,
    targets: { dailyCalories: 2000, proteinGrams: 120, carbohydrateGrams: 250, fatGrams: 60 },
    input: { startDate: "2026-10-01", endDate: "2026-10-31" },
    plan: { title: "Integration draft", explanation: "Fixture", days:
      ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"].map((dayOfWeek, index) => ({
        dayOfWeek, breakfastOptions: null, lunchOptions: null, dinnerOptions: null, snackOptions: null,
        nutritionGuidance: "Follow targets", notes: null,
        workouts: index === 0 ? [{ name: "Training", slot: "ANYTIME", estimatedDurationMinutes: 30, notes: null,
          exercises: [{ exerciseId, setsCount: 3, repMin: 8, repMax: 10 }] }] : [],
      })),
    },
  };
});

after(async () => {
  try {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.exercise.deleteMany({ where: { id: exerciseId } });
  } finally {
    await editor.end();
    await prisma.$disconnect();
  }
});

// Intercept the actual write, after real locking/comparison, while preserving the transaction.
function beforeWrite(hook) {
  return { $transaction: (callback, options) => prisma.$transaction((tx) => callback(new Proxy(tx, {
    get(target, key) {
      if (key === "plan") return { create: async (args) => { await hook(tx); return tx.plan.create(args); } };
      const value = target[key];
      return typeof value === "function" ? value.bind(target) : value;
    },
  })), options) };
}

test("saves complete draft without replacing the active plan", async () => {
  const active = await prisma.plan.create({ data: {
    userId, goalId: generation.source.goal.id, status: "ACTIVE", nutritionPlanStyle: "MACRO_BASED", timezone: "Africa/Cairo",
  } });
  const plan = await persistGeneratedDraft(generation);
  assert.equal(plan.status, "DRAFT");
  assert.equal(plan.days.length, 7);
  assert.equal(plan.days.flatMap((day) => day.workouts).length, 1);
  assert.equal(plan.activatedAt, null);
  assert.equal((await prisma.plan.findUnique({ where: { id: active.id } })).status, "ACTIVE");
});

test("stale profile context returns 409 and saves nothing", async () => {
  const beforeCount = await prisma.plan.count({ where: { userId } });
  await prisma.user.update({ where: { id: userId }, data: { timezone: "UTC" } });
  try {
    await assert.rejects(persistGeneratedDraft(generation), (error) => error.code === "PLAN_CONTEXT_CHANGED" && error.statusCode === 409);
    assert.equal(await prisma.plan.count({ where: { userId } }), beforeCount);
  } finally {
    await prisma.user.update({ where: { id: userId }, data: { timezone: "Africa/Cairo" } });
  }
});

test("draft saving does not recheck or lock previously validated catalog data", async () => {
  const plan = await persistGeneratedDraft(generation, beforeWrite(async () => {
    // A separate connection can edit the selected exercise while draft saving runs.
    await editor.query("UPDATE exercises SET is_active = false WHERE id = $1", [exerciseId]);
  }));
  assert.equal(plan.status, "DRAFT");
  await prisma.exercise.update({ where: { id: exerciseId }, data: { isActive: true } });
});

test("row locks prevent edits and new progress entries between check and save", async () => {
  const blocked = (query, values) => assert.rejects(editor.query(query, values), (error) => error.code === "55P03");
  const result = await saveDraftIfUnchanged(buildDraftInput(generation), beforeWrite(async () => {
    await blocked("UPDATE users SET timezone = 'UTC' WHERE id = $1", [userId]);
    await blocked("INSERT INTO progress_entries (id, body_profile_id, weight_kg) VALUES ($1, $2, 66)", [randomUUID(), userId]);
  }));
  assert.equal(result.ok, true);
  // The row becomes editable again after the save commits.
  await editor.query("UPDATE users SET timezone = 'Africa/Cairo' WHERE id = $1", [userId]);
});

test("invalid child write rolls back the entire draft", async () => {
  const input = buildDraftInput(generation);
  input.draftData.days.create[1].dayOfWeek = "MONDAY";
  const beforeCount = await prisma.plan.count({ where: { userId } });
  await assert.rejects(saveDraftIfUnchanged(input), (error) => error.code === "DATABASE_ERROR");
  assert.equal(await prisma.plan.count({ where: { userId } }), beforeCount);
});

test("new progress and changed active goal invalidate the generation context", async () => {
  const entry = await prisma.progressEntry.create({ data: { bodyProfileId: userId, weightKg: 66 } });
  try {
    await assert.rejects(persistGeneratedDraft(generation), (error) => error.code === "PLAN_CONTEXT_CHANGED");
  } finally {
    await prisma.progressEntry.delete({ where: { id: entry.id } });
  }
  await prisma.goal.update({ where: { id: generation.source.goal.id }, data: { status: "CANCELLED" } });
  try {
    await assert.rejects(persistGeneratedDraft(generation), (error) => error.code === "PLAN_CONTEXT_CHANGED");
  } finally {
    await prisma.goal.update({ where: { id: generation.source.goal.id }, data: { status: "ACTIVE" } });
  }
});

test("unrelated account timestamps do not invalidate the user context", async () => {
  await prisma.user.update({ where: { id: userId }, data: { updatedAt: new Date() } });
  assert.equal((await persistGeneratedDraft(generation)).status, "DRAFT");
});
