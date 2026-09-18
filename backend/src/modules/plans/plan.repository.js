import { isDeepStrictEqual } from "node:util";
import { Prisma } from "../../../generated/prisma/client.ts";
import { prisma } from "../../lib/prisma.js";
import { databaseError } from "../../middlewares/errorHandling.js";

// PostgreSQL's weekday enum is declared Monday through Sunday.
const planDetailsInclude = {
  days: {
    orderBy: { dayOfWeek: "asc" },
    include: { workouts: { orderBy: { orderIndex: "asc" } } },
  },
};

export async function findPlans(userId, { status, goalId, page, limit }, db = prisma) {
  const where = { userId, ...(status && { status }), ...(goalId && { goalId }) };
  try {
    const [items, totalItems] = await Promise.all([
      db.plan.findMany({
        where,
        select: {
          id: true, goalId: true, title: true, status: true, nutritionPlanStyle: true,
          timezone: true, startDate: true, endDate: true, activatedAt: true,
          endedAt: true, createdAt: true, updatedAt: true,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.plan.count({ where }),
    ]);
    return { items, totalItems };
  } catch {
    throw new databaseError("Database error occurred while listing plans.");
  }
}

export async function findOwnedPlanById(userId, planId, db = prisma) {
  try {
    return await db.plan.findFirst({
      where: { id: planId, userId }, include: planDetailsInclude,
    });
  } catch {
    throw new databaseError("Database error occurred while fetching the plan.");
  }
}

export async function findActivePlan(userId, db = prisma) {
  try {
    // Read stored status only; lifecycle transitions belong to activation/ending.
    return await db.plan.findFirst({
      where: { userId, status: "ACTIVE" }, include: planDetailsInclude,
    });
  } catch {
    throw new databaseError("Database error occurred while fetching the active plan.");
  }
}

// Keep projections separate from queries so the context contract is easy to
// review. Account credentials and unrelated identity fields are not needed.
const userSelect = {
  id: true,
  timezone: true,
  updatedAt: true,
};

const bodyProfileSelect = {
  userId: true,
  birthDate: true,
  sexForCalculation: true,
  heightCm: true,
  activityLevel: true,
  updatedAt: true,
};

const latestProgressSelect = {
  id: true,
  recordedAt: true,
  weightKg: true,
  bodyFatPercentage: true,
  createdAt: true,
};

const goalSelect = {
  id: true,
  goalType: true,
  status: true,
  targetWeightKg: true,
  targetDate: true,
  updatedAt: true,
};

const healthProfileSelect = {
  healthConditions: true,
  movementLimitations: true,
  specialPlanningStates: true,
  requiresProfessionalClearance: true,
  safetyNotes: true,
  updatedAt: true,
};

const nutritionProfileSelect = {
  dietaryPreferenceCodes: true,
  foodAllergies: true,
  foodIntolerances: true,
  foodPreferences: true,
  mealsPerDay: true,
  snacksPerDay: true,
  planStyle: true,
  cookingSkill: true,
  maxMealPrepMinutes: true,
  kitchenAccess: true,
  foodBudgetLevel: true,
  updatedAt: true,
};

const trainingProfileSelect = {
  overallExperienceLevel: true,
  resistanceTrainingLevel: true,
  cardioTrainingLevel: true,
  trainingDaysPerWeek: true,
  availableDays: true,
  preferredSessionMinutes: true,
  trainingEnvironment: true,
  availableEquipment: true,
  preferredTrainingStyles: true,
  preferredCardioType: true,
  updatedAt: true,
};

// Each private profile is keyed by the owner's BodyProfile.userId.
// Return the same names consumed by plan.rules.js and plan.service.js.
export async function getPlanGenerationSourceData(userId, db = prisma) {
  try {
    const [
      user,
      bodyProfile,
      latestProgress,
      goal,
      healthProfile,
      nutritionProfile,
      trainingProfile,
    ] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: userSelect,
      }),
      db.bodyProfile.findUnique({
        where: { userId },
        select: bodyProfileSelect,
      }),
      db.progressEntry.findFirst({
        where: { bodyProfileId: userId },
        select: latestProgressSelect,
        // A backdated check-in entered today must not replace a newer reading.
        orderBy: [
          { recordedAt: "desc" },
          { createdAt: "desc" },
          { id: "desc" },
        ],
      }),
      db.goal.findFirst({
        where: { userId, status: "ACTIVE" },
        select: goalSelect,
      }),
      db.healthProfile.findUnique({
        where: { bodyProfileId: userId },
        select: healthProfileSelect,
      }),
      db.nutritionProfile.findUnique({
        where: { bodyProfileId: userId },
        select: nutritionProfileSelect,
      }),
      db.trainingProfile.findUnique({
        where: { bodyProfileId: userId },
        select: trainingProfileSelect,
      }),
    ]);

    return {
      user,
      bodyProfile,
      latestProgress,
      goal,
      healthProfile,
      nutritionProfile,
      trainingProfile,
    };
  } catch {
    throw new databaseError(
      "Database error occurred while fetching plan generation source data."
    );
  }
}

// Identifiers are fixed here, never supplied by a request or model.

// table , key column for WHERE, key column for SELECT
// we use this to lock the context rows in a transaction before checking for changes and saving a draft plan.
const CONTEXT_LOCKS = [
  ["users", "id", "id"],
  ["body_profiles", "user_id", "user_id"],
  ["goals", "user_id", "id"],
  ["progress_entries", "body_profile_id", "id"],
  ["health_profiles", "body_profile_id", "body_profile_id"],
  ["nutrition_profiles", "body_profile_id", "body_profile_id"],
  ["training_profiles", "body_profile_id", "body_profile_id"],
];


// select fo update what we actually want 
// it tells postgres to lock these rows for this transcation 
// the locks will be released when the transaction ends (commit or rollback)
// that is why we send as a argumnet a transaction object (tx) instead of the prisma client (db)
// if we mistakly send the prisma client (db) instead of the transaction object (tx) 
// we will not be locking the rows and we will be able to save a draft plan even if the context has changed
async function lockContext(tx, userId) {
  // Parent FOR UPDATE locks also block FK checks for newly inserted children.
  // Lock every existing goal/progress row: an older row can become active/latest.
  // // table name, column used to find this user's rows, column selected for locking
  for (const [table, owner, key] of CONTEXT_LOCKS) {
    await tx.$queryRaw(Prisma.sql`
      SELECT ${Prisma.raw(key)} FROM ${Prisma.raw(table)}
      WHERE ${Prisma.raw(owner)} = ${userId}::uuid
      ORDER BY ${Prisma.raw(key)} FOR UPDATE
    `);
  }
}

// Compare actual generation inputs, not unrelated edits to account timestamps.
// JSON conversion normalizes Prisma Decimals and Dates before comparison.
function sameGenerationContext(expected, current) {
  // first we normalize the objects by removing the updatedAt field and converting to JSON
  const normalize = (value) => JSON.parse(JSON.stringify(value, (key, entry) =>
    key === "updatedAt" ? undefined : entry
  ));
  // then we compare the normalized objects using deep strict equality
  // this is a recursive comparison that checks all nested properties and values
  // we may need to replace this with a more efficient comparison if the objects are large or complex
  // that may take a long time and block the event loop, so we may need to use a worker thread or a streaming comparison
  return isDeepStrictEqual(normalize(expected), normalize(current));
}
// so this do that in order 
// 1. locks 
// 2. checks if the context has changed
// // 3. create the draft plan if the context has not changed
// The lock must belong to THE SAME transaction
// that performs the check and save.
export async function saveDraftIfUnchanged(input, db = prisma) {
  try {
    return await db.$transaction(async (tx) => {
      await lockContext(tx, input.userId);
      const current = await getPlanGenerationSourceData(input.userId, tx);
      if (!sameGenerationContext(input.expectedContext, current)) {
        return { ok: false, reason: "PLAN_CONTEXT_CHANGED" };
      }

      // The proposal was validated before persistence. Only user context is rechecked.
      const data = {
        ...input.draftData,
        days: { create: input.draftData.days.create.map((day) => ({
          ...day,
          breakfastOptions: day.breakfastOptions ?? Prisma.DbNull,
          lunchOptions: day.lunchOptions ?? Prisma.DbNull,
          dinnerOptions: day.dinnerOptions ?? Prisma.DbNull,
          snackOptions: day.snackOptions ?? Prisma.DbNull,
        })) },
      };
      const plan = await tx.plan.create({
        data,
        include: { days: { include: { workouts: { orderBy: { orderIndex: "asc" } } } } },
      });
      return { ok: true, plan };
    }, { isolationLevel: "ReadCommitted", maxWait: 5000, timeout: 15000 });
  } catch (cause) {
    const error = new databaseError("Database error occurred while saving the draft plan.");
    error.cause = cause;
    throw error;
  }
}
