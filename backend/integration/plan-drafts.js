// Explicit integration suite: creates unique fixtures, then deletes only those fixtures.
// Run against a dedicated test database: npm run test:plans-db
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import pg from "pg";
import { formatInTimeZone } from "date-fns-tz";
import { calculateFitnessTargets } from "../src/modules/profiles/profile.targets.js";
import { activatePlan } from "../src/modules/plans/plan.service.js";
import { app } from "../src/app.js";
import { createAccessToken } from "../src/modules/auth/auth.tokens.js";
import { prisma } from "../src/lib/prisma.js";
import { getPlanGenerationSourceData } from "../src/modules/plans/plan.repository.js";
import { saveDraftIfUnchanged } from "../src/modules/plans/plan.repository.js";
import { arePlanSelectionsAvailable } from "../src/modules/plans/plan.repository.js";
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

test("plan read endpoints enforce ownership, pagination, ordering and validation", async () => {
  const otherUserId = randomUUID();
  let server;
  try {
    await prisma.user.update({ where: { id: userId }, data: { emailVerified: true } });
    await prisma.user.create({ data: {
      id: otherUserId, email: `${otherUserId}@example.test`, username: otherUserId.slice(0, 25),
      passwordHash: "integration-only", emailVerified: true,
    } });
    const headersFor = async (id) => {
      const session = await prisma.authSession.create({ data: { userId: id, expiresAt: new Date(Date.now() + 60000) } });
      return { Authorization: `Bearer ${createAccessToken({ userId: id, sessionId: session.id })}` };
    };
    const ownHeaders = await headersFor(userId);
    const otherHeaders = await headersFor(otherUserId);
    server = await new Promise((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    const base = `http://127.0.0.1:${server.address().port}/api/plans`;
    const get = async (path, headers = ownHeaders) => {
      const response = await fetch(base + path, { headers });
      return { response, body: await response.json() };
    };

    for (const path of ["", "/active", `/${randomUUID()}`]) {
      assert.equal((await get(path, {})).response.status, 401);
    }
    const listed = await get("?status=DRAFT&limit=1");
    assert.equal(listed.response.status, 200);
    assert.equal(listed.response.headers.get("cache-control"), "no-store");
    assert.equal(listed.body.data.items.length, 1);
    assert.equal(listed.body.data.items[0].status, "DRAFT");
    assert.equal(listed.body.data.pagination.hasNextPage, true);
    assert.equal("days" in listed.body.data.items[0], false);
    const planId = listed.body.data.items[0].id;
    const secondPage = await get("?status=DRAFT&limit=1&page=2");
    assert.notEqual(secondPage.body.data.items[0].id, planId);
    const filtered = await get(`?goalId=${randomUUID()}`);
    assert.deepEqual(filtered.body.data.items, []);
    assert.equal(filtered.body.data.pagination.totalItems, 0);

    const detailed = await get(`/${planId}`);
    assert.equal(detailed.response.status, 200);
    assert.deepEqual(detailed.body.data.days.map((day) => day.dayOfWeek),
      ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]);
    assert.equal(detailed.body.data.days[0].workouts[0].orderIndex, 0);
    assert.equal((await get("/active")).body.data.status, "ACTIVE");
    assert.equal((await get("/active", otherHeaders)).body.data, null);
    assert.deepEqual((await get("", otherHeaders)).body.data.items, []);
    for (const id of [planId, randomUUID()]) {
      const missing = await get(`/${id}`, otherHeaders);
      assert.equal(missing.response.status, 404);
      assert.equal(missing.body.code, "PLAN_NOT_FOUND");
    }
    for (const path of ["/not-a-uuid", "?limit=51", "?page=0", "?status=UNKNOWN", "?userId=" + otherUserId]) {
      assert.equal((await get(path)).response.status, 400);
    }
    // /context remains a static route, not a planId.
    assert.equal((await get("/context")).response.status, 200);
  } finally {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await prisma.user.deleteMany({ where: { id: otherUserId } });
  }
});

test("plan activation lifecycle", async (t) => {
  await prisma.bodyProfile.update({ where: { userId }, data: { activityLevel: "MODERATELY_ACTIVE" } });
  await prisma.progressEntry.create({ data: { bodyProfileId: userId, weightKg: 65 } });
  await prisma.healthProfile.create({ data: {
    bodyProfileId: userId, healthConditions: [], movementLimitations: [], specialPlanningStates: [],
  } });
  await prisma.nutritionProfile.update({ where: { bodyProfileId: userId }, data: {
    dietaryPreferenceCodes: [], foodAllergies: [], foodIntolerances: [],
  } });
  await prisma.trainingProfile.create({ data: {
    bodyProfileId: userId, overallExperienceLevel: "BEGINNER", trainingDaysPerWeek: 1,
    availableDays: [{ day: 1, available: true, maxMinutes: 60 }],
    preferredSessionMinutes: 60, trainingEnvironment: "HOME_MINIMAL", availableEquipment: [],
  } });
  await prisma.exercise.update({ where: { id: exerciseId }, data: { trackingMetrics: ["SETS", "REPS"] } });
  const newDraft = async () => {
    const source = await getPlanGenerationSourceData(userId);
    const targets = calculateFitnessTargets({ bodyProfile: source.bodyProfile, goal: source.goal, progressEntry: source.latestProgress });
    const today = formatInTimeZone(new Date(), source.user.timezone, "yyyy-MM-dd");
    const plan = structuredClone(generation.plan);
    plan.days[0].workouts[0].exercises[0] = {
      exerciseId, setsCount: 3, repMin: 8, repMax: 10, weightKg: null,
      durationSeconds: null, distanceMeters: null, restSeconds: 60, notes: null,
    };
    return persistGeneratedDraft({ ...generation, source, targets, plan, input: { startDate: today, endDate: today } });
  };
  const activeId = async () => (await prisma.plan.findFirst({ where: { userId, status: "ACTIVE" } }))?.id ?? null;

  await t.test("HTTP activation supersedes previous plan and repeated activation is idempotent", async () => {
    const previousId = await activeId();
    const draft = await newDraft();
    const session = await prisma.authSession.create({ data: { userId, expiresAt: new Date(Date.now() + 60000) } });
    const token = createAccessToken({ userId, sessionId: session.id });
    const server = await new Promise((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
    try {
      const url = `http://127.0.0.1:${server.address().port}/api/plans/${draft.id}/activate`;
      const post = (body, authorized = true) => fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json", ...(authorized && { Authorization: `Bearer ${token}` }) },
        body: JSON.stringify(body),
      });
      assert.equal((await post({ expectedActivePlanId: previousId }, false)).status, 401);
      assert.equal((await post({})).status, 400);
      const response = await post({ expectedActivePlanId: previousId });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const { data } = await response.json();
      assert.equal(data.status, "ACTIVE");
      assert.ok(data.activatedAt);
      const repeated = await (await post({ expectedActivePlanId: previousId })).json();
      assert.equal(repeated.data.activatedAt, data.activatedAt);
      assert.equal((await prisma.plan.findUnique({ where: { id: previousId } })).status, "SUPERSEDED");
      assert.equal(await prisma.workout.count({ where: { userId } }), 0);
      assert.equal(await prisma.meal.count({ where: { userId } }), 0);
    } finally { await new Promise((resolve) => server.close(resolve)); }
  });

  await t.test("concurrent different activations have one winner and one stale-active conflict", async () => {
    const expectedActivePlanId = await activeId();
    const a = await newDraft(), b = await newDraft();
    const results = await Promise.allSettled([
      activatePlan(userId, a.id, { expectedActivePlanId }),
      activatePlan(userId, b.id, { expectedActivePlanId }),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.find((r) => r.status === "rejected").reason.code, "PLAN_ACTIVE_CHANGED");
    assert.equal(await prisma.plan.count({ where: { userId, status: "ACTIVE" } }), 1);
  });

  await t.test("ownership and terminal states reject activation", async () => {
    const draft = await newDraft();
    await assert.rejects(activatePlan(randomUUID(), draft.id, { expectedActivePlanId: null }), (e) => e.code === "PLAN_NOT_FOUND");
    await prisma.plan.update({ where: { id: draft.id }, data: { status: "ENDED" } });
    await assert.rejects(activatePlan(userId, draft.id, { expectedActivePlanId: await activeId() }), (e) => e.code === "PLAN_NOT_DRAFT");
  });

  await t.test("dates, stale constraints and unavailable exercises leave the active plan unchanged", async () => {
    const previousId = await activeId();
    const draft = await newDraft();
    await prisma.plan.update({ where: { id: draft.id }, data: { startDate: new Date("2099-01-01"), endDate: new Date("2099-01-02") } });
    await assert.rejects(activatePlan(userId, draft.id, { expectedActivePlanId: previousId }), (e) => e.code === "PLAN_DATES_INVALID");
    const stale = await newDraft();
    await prisma.healthProfile.update({ where: { bodyProfileId: userId }, data: { safetyNotes: "New planning restriction", updatedAt: new Date(Date.now() + 1000) } });
    await assert.rejects(activatePlan(userId, stale.id, { expectedActivePlanId: previousId }), (e) => e.code === "PLAN_CONTEXT_CHANGED");
    // Restore a normal timestamp before creating the next independent draft.
    await prisma.healthProfile.update({ where: { bodyProfileId: userId }, data: { updatedAt: new Date() } });
    const unavailable = await newDraft();
    await prisma.exercise.update({ where: { id: exerciseId }, data: { isActive: false } });
    try {
      await assert.rejects(activatePlan(userId, unavailable.id, { expectedActivePlanId: previousId }), (e) => e.code === "PLAN_CONTENT_INVALID");
    } finally { await prisma.exercise.update({ where: { id: exerciseId }, data: { isActive: true } }); }
    assert.equal(await activeId(), previousId);
  });

  await t.test("availability check handles ownership, missing items, duplicates and recipe ingredients", async () => {
    const otherUserId = randomUUID(), foodId = randomUUID(), recipeId = randomUUID();
    try {
      await prisma.user.create({ data: {
        id: otherUserId, email: `${otherUserId}@example.test`, username: otherUserId.slice(0, 25), passwordHash: "test",
      } });
      await prisma.food.create({ data: {
        id: foodId, nameEn: "Availability fixture", createdByUserId: userId,
        caloriesPer100g: 100, proteinGramsPer100g: 10, carbohydrateGramsPer100g: 10, fatGramsPer100g: 2,
      } });
      await prisma.recipe.create({ data: {
        id: recipeId, nameEn: "Availability recipe", createdByUserId: userId,
        servings: 1, totalYieldGrams: 100, caloriesPerServing: 100,
        proteinGramsPerServing: 10, carbohydrateGramsPerServing: 10, fatGramsPerServing: 2,
        ingredients: { create: { foodId, quantityGrams: 100, orderIndex: 0 } },
      } });
      const selection = (items) => ({ days: [{ workouts: [], breakfastOptions: [{ items }] }] });
      const foods = selection([{ itemType: "FOOD", foodId }, { itemType: "FOOD", foodId: foodId.toUpperCase() }]);
      const recipe = selection([{ itemType: "RECIPE", recipeId }]);
      assert.equal(await arePlanSelectionsAvailable(userId, foods), true);
      assert.equal(await arePlanSelectionsAvailable(otherUserId, foods), false);
      assert.equal(await arePlanSelectionsAvailable(userId, recipe), true);
      assert.equal(await arePlanSelectionsAvailable(otherUserId, recipe), false);
      assert.equal(await arePlanSelectionsAvailable(userId, selection([{ itemType: "FOOD", foodId: randomUUID() }])), false);
      assert.equal(await arePlanSelectionsAvailable(userId, selection([{ itemType: "RECIPE", recipeId: randomUUID() }])), false);
      assert.equal(await arePlanSelectionsAvailable(userId, { days: [{ workouts: [{ exercises: [{ exerciseId: randomUUID() }] }] }] }), false);
      await prisma.food.update({ where: { id: foodId }, data: { isActive: false } });
      assert.equal(await arePlanSelectionsAvailable(userId, foods), false);
      assert.equal(await arePlanSelectionsAvailable(userId, recipe), false);
      await prisma.food.update({ where: { id: foodId }, data: { isActive: true, createdByUserId: otherUserId } });
      assert.equal(await arePlanSelectionsAvailable(userId, recipe), false);
      await prisma.food.update({ where: { id: foodId }, data: { createdByUserId: null } });
      assert.equal(await arePlanSelectionsAvailable(userId, foods), true);
      assert.equal(await arePlanSelectionsAvailable(userId, recipe), true);
      await prisma.recipe.update({ where: { id: recipeId }, data: { isActive: false } });
      assert.equal(await arePlanSelectionsAvailable(userId, recipe), false);

      // Changed nutrients/equipment are intentionally not revalidated at activation.
      const draft = await newDraft();
      await prisma.planDay.update({ where: { id: draft.days[0].id }, data: {
        breakfastOptions: [{ id: randomUUID(), label: "Breakfast", note: null,
          items: [{ itemType: "FOOD", foodId, quantityGrams: 100 }] }],
      } });
      await prisma.food.update({ where: { id: foodId }, data: { caloriesPer100g: 10000 } });
      await prisma.exercise.update({ where: { id: exerciseId }, data: { equipment: "BARBELL" } });
      assert.equal((await activatePlan(userId, draft.id, { expectedActivePlanId: await activeId() })).status, "ACTIVE");
    } finally {
      await prisma.exercise.update({ where: { id: exerciseId }, data: { equipment: "BODY_WEIGHT" } });
      await prisma.recipe.deleteMany({ where: { id: recipeId } });
      await prisma.food.deleteMany({ where: { id: foodId } });
      await prisma.user.deleteMany({ where: { id: otherUserId } });
    }
  });

  await t.test("a failed activation write rolls back superseding the old plan", async () => {
    const previousId = await activeId();
    const draft = await newDraft();
    const failingDb = { $transaction: (callback, options) => prisma.$transaction((tx) => callback(new Proxy(tx, {
      get(target, key) {
        if (key === "plan") return new Proxy(tx.plan, { get(model, method) {
          if (method === "update") return async (args) => {
            if (args.data.status === "ACTIVE") throw new Error("Simulated write failure");
            return model.update(args);
          };
          return model[method].bind(model);
        } });
        const value = target[key];
        return typeof value === "function" ? value.bind(target) : value;
      },
    })), options) };
    // Service reads use the real client; only the final transaction injects a failure.
    const db = new Proxy(prisma, { get(target, key) {
      if (key === "$transaction") return failingDb.$transaction;
      const value = target[key];
      return typeof value === "function" ? value.bind(target) : value;
    } });
    await assert.rejects(activatePlan(userId, draft.id, { expectedActivePlanId: previousId }, db), (e) => e.code === "DATABASE_ERROR");
    assert.equal(await activeId(), previousId);
    assert.equal((await prisma.plan.findUnique({ where: { id: draft.id } })).status, "DRAFT");
  });
});
