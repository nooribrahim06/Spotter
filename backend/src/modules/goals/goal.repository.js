import { prisma } from "../../lib/prisma.js";
import { databaseError } from "../../middlewares/errorHandling.js";

// ============ Find the goal created during onboarding ============
// isOnboardingGoal is not the current status. it is an internal marker that
// lets us find this same goal after DRAFT changes to ACTIVE.
export async function findOnboardingGoalByUserId(userId, db = prisma) {
  try {
    return await db.goal.findUnique({
      where: {
        userId_isOnboardingGoal: {
          userId,
          isOnboardingGoal: true,
        },
      },
    });
  } catch {
    throw new databaseError(
      "Database error occurred while finding the onboarding goal."
    );
  }
}
//======== === Find the active goal for a user ============
export async function findActiveGoalByUserId(userId, db = prisma) {
  try {
    return await db.goal.findFirst({
      where: {
        userId,
        status: "ACTIVE",
      },
    });
  } catch {
    throw new databaseError(
      "Database error occurred while finding the active goal."
    );
  }
}
// ============ Create or update the onboarding goal ============
// repeated step 2 saves must edit the same row, not create more and more goals.
export async function upsertOnboardingGoal(userId, goalData, db = prisma) {
  const data = {
    goalType: goalData.goalType,
    // null here is intentional: optional data the user removed must be cleared.
    targetWeightKg: goalData.targetWeightKg ?? null,
    targetDate: goalData.targetDate ?? null,
    status: "DRAFT",
    isOnboardingGoal: true,
  };

  try {
    return await db.goal.upsert({
      where: {
        userId_isOnboardingGoal: {
          userId,
          isOnboardingGoal: true,
        },
      },
      create: { userId, ...data },
      update: data,
    });
  } catch {
    throw new databaseError(
      "Database error occurred while saving the onboarding goal."
    );
  }
}
// ============ Create a new goal for a user ============
export async function createGoal(userId, goalData, db = prisma) {
  const data = {
    userId,
    goalType: goalData.goalType,
    targetWeightKg: goalData.targetWeightKg ?? null,
    targetDate: goalData.targetDate ?? null,
    status: "DRAFT",
    isOnboardingGoal: false,
  };

  try {
    return await db.goal.create({
      data,
    });
  } catch {
    throw new databaseError(
      "Database error occurred while creating a new goal."
    );
  }
}
// ============ Activate the saved goal during step 3 ============
export async function activateGoal(goalId, db = prisma) {
  try {
    return await db.goal.update({
      where: { id: goalId },
      data: { status: "ACTIVE" },
    });
  } catch {
    throw new databaseError("Database error occurred while activating the goal.");
  }
}
