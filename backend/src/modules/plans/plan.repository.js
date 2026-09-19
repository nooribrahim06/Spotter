import { isDeepStrictEqual } from "node:util";
import { Prisma } from "../../../generated/prisma/client.ts";
import { prisma } from "../../lib/prisma.js";
import { databaseError, AppError, PlanNotFoundError, PlanActivationConflictError, PlanStatusConflictError } from "../../middlewares/errorHandling.js";

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

// Activation only checks that every selected item is still usable by this user.
export async function arePlanSelectionsAvailable(userId, plan, db = prisma) {
  const exerciseIds = new Set();
  const foodIds = new Set();
  const recipeIds = new Set();
  for (const day of plan.days) {
    for (const workout of day.workouts) {
      for (const exercise of workout.exercises) exerciseIds.add(exercise.exerciseId.toLowerCase());
    }
    for (const options of [day.breakfastOptions, day.lunchOptions, day.dinnerOptions, day.snackOptions]) {
      for (const option of options ?? []) {
        for (const item of option.items) {
          if (item.itemType === "FOOD") foodIds.add(item.foodId.toLowerCase());
          else recipeIds.add(item.recipeId.toLowerCase());
        }
      }
    }
  }

  const visible = { isActive: true, OR: [{ createdByUserId: null }, { createdByUserId: userId }] };
  try {
    // Count unique accessible IDs; no nutrient loading or repeated plan validation.
    const [exercises, foods, recipes] = await Promise.all([
      exerciseIds.size ? db.exercise.count({
        where: { id: { in: [...exerciseIds] }, isActive: true },
      }) : 0,
      foodIds.size ? db.food.count({
        where: { id: { in: [...foodIds] }, ...visible },
      }) : 0,
      recipeIds.size ? db.recipe.count({ where: {
        id: { in: [...recipeIds] }, ...visible,
        ingredients: { every: { food: { is: visible } } },
      } }) : 0,
    ]);
    return exercises === exerciseIds.size && foods === foodIds.size && recipes === recipeIds.size;
  } catch (cause) {
    const error = new databaseError("Database error occurred while checking plan item availability.");
    error.cause = cause;
    throw error;
  }
}

export async function activateOwnedPlan(userId, planId, expectedActivePlanId, db = prisma) {
  try {
    return await db.$transaction(async (tx) => {
      // One user-row lock makes competing activations take turns.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      
      const plan = await tx.plan.findFirst({ where: { id: planId, userId }, include: planDetailsInclude });
      if (!plan) throw new PlanNotFoundError();
      // A retry returns the original activation, without resetting its timestamp.
      if (plan.status === "ACTIVE") return plan;
      if (plan.status !== "DRAFT") {
        throw new PlanActivationConflictError("Only a draft plan can be activated.", "PLAN_NOT_DRAFT");
      }
      const active = await tx.plan.findFirst({ where: { userId, status: "ACTIVE" }, select: { id: true } });
      if ((active?.id ?? null) !== expectedActivePlanId) {
        throw new PlanActivationConflictError("Your active plan changed. Refresh before activating this draft.", "PLAN_ACTIVE_CHANGED");
      }
      // Profile/catalog checks already ran in the service, outside this transaction.
      const now = new Date();

      if (active) {
        await tx.plan.update({
          where: { id: active.id },
          data: { status: "SUPERSEDED", endedAt: now },
        });
      }
      return tx.plan.update({
        where: { id: plan.id }, data: { status: "ACTIVE", activatedAt: now, endedAt: null },
        include: planDetailsInclude,
      });
    }, { isolationLevel: "ReadCommitted", maxWait: 5000, timeout: 15000 });
  } catch (cause) {
    if (cause instanceof AppError) throw cause;
    const error = new databaseError("Database error occurred while activating the plan.");
    error.cause = cause;
    throw error;
  }
}

export async function endOwnedActivePlan(userId, planId, db = prisma) {
  try {
    return await db.$transaction(async (tx) => {
      // One user-row lock coordinates status writes with activations
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;

      const plan = await tx.plan.findFirst({ where: { id: planId, userId }, include: planDetailsInclude });
      if (!plan) throw new PlanNotFoundError();

      // Idempotent return if already ended
      if (plan.status === "ENDED") return plan;

      if (plan.status !== "ACTIVE") {
        throw new PlanStatusConflictError("Only an active plan can be ended.", "PLAN_NOT_ACTIVE");
      }

      const now = new Date();
      return tx.plan.update({
        where: { id: plan.id },
        data: { status: "ENDED", endedAt: now },
        include: planDetailsInclude,
      });
    }, { isolationLevel: "ReadCommitted", maxWait: 5000, timeout: 15000 });
  } catch (cause) {
    if (cause instanceof AppError) throw cause;
    const error = new databaseError("Database error occurred while ending the plan.");
    error.cause = cause;
    throw error;
  }
}

export async function discardOwnedDraftPlan(userId, planId, db = prisma) {
  try {
    return await db.$transaction(async (tx) => {
      // One user-row lock coordinates status writes with activations
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;

      const plan = await tx.plan.findFirst({ where: { id: planId, userId }, include: planDetailsInclude });
      if (!plan) throw new PlanNotFoundError();

      // Idempotent return if already discarded
      if (plan.status === "DISCARDED") return plan;

      if (plan.status !== "DRAFT") {
        throw new PlanStatusConflictError("Only a draft plan can be discarded.", "PLAN_NOT_DRAFT");
      }

      return tx.plan.update({
        where: { id: plan.id },
        data: { status: "DISCARDED" },
        include: planDetailsInclude,
      });
    }, { isolationLevel: "ReadCommitted", maxWait: 5000, timeout: 15000 });
  } catch (cause) {
    if (cause instanceof AppError) throw cause;
    const error = new databaseError("Database error occurred while discarding the draft plan.");
    error.cause = cause;
    throw error;
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

export async function expireOverduePlans(asOfDate = new Date(), db = prisma) {
  try {
    return await db.$transaction(async (tx) => {
      // 1. Mark overdue drafts as DISCARDED
      const discardedDraftsCount = await tx.$executeRaw`
        UPDATE plans
        SET status = 'DISCARDED'::"PlanStatus",
            updated_at = NOW()
        WHERE status = 'DRAFT'::"PlanStatus"
          AND end_date < (${asOfDate}::timestamptz AT TIME ZONE timezone)::date
      `;

      // 2. Mark overdue active plans as ENDED with boundary timestamp
      const endedActivePlansCount = await tx.$executeRaw`
        UPDATE plans
        SET status = 'ENDED'::"PlanStatus",
            ended_at = (end_date + 1 + TIME '00:00:00') AT TIME ZONE timezone,
            updated_at = NOW()
        WHERE status = 'ACTIVE'::"PlanStatus"
          AND end_date < (${asOfDate}::timestamptz AT TIME ZONE timezone)::date
      `;

      return {
        discardedDraftsCount: Number(discardedDraftsCount),
        endedActivePlansCount: Number(endedActivePlansCount),
      };
    }, { isolationLevel: "ReadCommitted", maxWait: 5000, timeout: 30000 });
  } catch (cause) {
    if (cause instanceof AppError) throw cause;
    const error = new databaseError("Database error occurred while expiring overdue plans.");
    error.cause = cause;
    throw error;
  }
}

