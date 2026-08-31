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
