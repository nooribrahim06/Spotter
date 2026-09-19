import { prisma } from "../../lib/prisma.js";
import {
  ActiveGoalExistsError,
  AppError,
  databaseError,
  InvalidGoalStateError,
} from "../../middlewares/errorHandling.js";
import { cascadeGoalStatusChangeToPlans } from "../plans/plan.repository.js";

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

export async function findGoalByIdForUser(goalId, userId, db = prisma) {
  try {
    return await db.goal.findFirst({
      where: {
        id: goalId,
        userId,
      },
    });
  } catch {
    throw new databaseError("Database error occurred while finding the goal.");
  }
}

// ============ Find all goals for a user ============
export async function findAllGoalsByUserId(userId, db = prisma) {
  try {
    return await db.goal.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  } catch {
    throw new databaseError(
      "Database error occurred while finding all goals for the user."
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
    // Regular goals use NULL so the onboarding marker's composite unique
    // constraint does not limit a user to one historical regular goal.
    isOnboardingGoal: null,
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
// ============ Activate a saved draft ============
export async function activateGoal(goalId, userId, db = prisma) {
  let goals;
  try {
    goals = await db.goal.updateManyAndReturn({
      where: {
        id: goalId,
        userId,
        status: "DRAFT",
      },
      data: {
        status: "ACTIVE",
        startedAt: new Date(),
      },
    });
  } catch (error) {
    // The partial PostgreSQL index is the final concurrency safeguard. A
    // rejected update remains a DRAFT, so activation never destroys its data.
    if (error?.code === "P2002") {
      throw new ActiveGoalExistsError();
    }

    throw new databaseError("Database error occurred while activating the goal.");
  }

  if (!goals[0]) {
    throw new InvalidGoalStateError("Only a draft goal can be activated.");
  }

  return goals[0];
}
// ============ Update a Goal ============
export async function updateGoal(goalId, userId, updatedData, db = prisma) {
  let goals;
  try {
    goals = await db.goal.updateManyAndReturn({
      where: {
        id: goalId,
        userId,
        status: "DRAFT",
      },
      data: updatedData,
    });
  } catch {
    throw new databaseError("Database error occurred while updating the goal.");
  }

  if (!goals[0]) {
    throw new InvalidGoalStateError("Only a draft goal can be edited.");
  }

  return goals[0];
}
// ============ Complete a Goal ============
export async function completeGoal(goalId, userId, db = prisma) {
  const completeInsideTransaction = async (tx) => {
    if (typeof tx.$queryRaw === "function") {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
    }

    const goals = await tx.goal.updateManyAndReturn({
      where: {
        id: goalId,
        userId,
        status: "ACTIVE",
      },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    if (!goals[0]) {
      throw new InvalidGoalStateError("Only an active goal can be completed.");
    }

    await cascadeGoalStatusChangeToPlans(userId, goalId, tx);
    return goals[0];
  };

  try {
    if (typeof db.$transaction === "function") {
      return await db.$transaction(completeInsideTransaction, {
        isolationLevel: "ReadCommitted",
        maxWait: 5000,
        timeout: 15000,
      });
    }
    return await completeInsideTransaction(db);
  } catch (cause) {
    if (cause instanceof AppError) throw cause;
    const error = new databaseError("Database error occurred while completing the goal.");
    error.cause = cause;
    throw error;
  }
}

// ============ Cancel a Goal ============
export async function cancelGoal(goalId, userId, db = prisma) {
  const cancelInsideTransaction = async (tx) => {
    if (typeof tx.$queryRaw === "function") {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
    }

    const goals = await tx.goal.updateManyAndReturn({
      where: {
        id: goalId,
        userId,
        status: { in: ["DRAFT", "ACTIVE"] },
      },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
      },
    });

    if (!goals[0]) {
      throw new InvalidGoalStateError(
        "Only a draft or active goal can be cancelled."
      );
    }

    if (tx.plan) {
      await cascadeGoalStatusChangeToPlans(userId, goalId, tx);
    }

    return goals[0];
  };

  try {
    if (typeof db.$transaction === "function") {
      return await db.$transaction(cancelInsideTransaction, {
        isolationLevel: "ReadCommitted",
        maxWait: 5000,
        timeout: 15000,
      });
    }
    return await cancelInsideTransaction(db);
  } catch (cause) {
    if (cause instanceof AppError) throw cause;
    const error = new databaseError("Database error occurred while cancelling the goal.");
    error.cause = cause;
    throw error;
  }
}
