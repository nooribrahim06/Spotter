import { prisma } from "../../lib/prisma.js";
import { databaseError } from "../../middlewares/errorHandling.js";

// ============ Create the starting point for progress tracking ============
// the first weight is the currentWeightKg saved in step 1. upsert plus the
// database unique index means retries can never create two initial entries.
export async function createInitialProgressEntry(
  { bodyProfileId, goalId, weightKg },
  db = prisma
) {
  try {
    return await db.progressEntry.create({
      data: {
        bodyProfileId,
        goalId,
        weightKg,
        isInitialForGoal: true,
      },
    });
  } catch {
    throw new databaseError(
      "Database error occurred while creating the initial progress entry."
    );
  }
}

// Current body progress belongs to the user's BodyProfile. It is not filtered
// by goalId because regular check-ins may not be attached to a specific goal.
export async function findLatestProgressEntryByUserId(
  userId,
  db = prisma
) {
  try {
    return await db.progressEntry.findFirst({
      where: { bodyProfileId: userId },
      select: {
        id: true,
        recordedAt: true,
        weightKg: true,
        bodyFatPercentage: true,
        skeletalMuscleMassKg: true,
        restingHeartRateBpm: true,
        notes: true,
        measurements: {
          select: {
            measurementType: true,
            valueCm: true,
          },
        },
      },
      orderBy: [{ recordedAt: "desc" }, { createdAt: "desc" }],
    });
  } catch {
    throw new databaseError(
      "Database error occurred while finding the latest progress entry."
    );
  }
}
