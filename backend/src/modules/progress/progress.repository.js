import { prisma } from "../../lib/prisma.js";
import { databaseError } from "../../middlewares/errorHandling.js";

const progressEntrySelect = {
  id: true,
  bodyProfileId: true,
  goalId: true,
  recordedAt: true,
  weightKg: true,
  bodyFatPercentage: true,
  skeletalMuscleMassKg: true,
  restingHeartRateBpm: true,
  notes: true,
  isInitialForGoal: true,
  createdAt: true,
  measurements: {
    select: {
      id: true,
      measurementType: true,
      valueCm: true,
      createdAt: true,
    },
  },
};

// ============ Create the starting point for progress tracking ============
// The first weight is the startingWeightKg saved in onboarding.
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
      select: progressEntrySelect,
    });
  } catch {
    throw new databaseError(
      "Database error occurred while creating the initial progress entry."
    );
  }
}

// ============ Create a new progress check-in ============
export async function createProgressEntry(
  progressData,
  userId,
  db = prisma
) {
  const { measurements = [], ...entryData } = progressData;

  try {
    return await db.progressEntry.create({
      data: {
        bodyProfileId: userId,
        ...entryData,
        ...(measurements.length > 0
          ? {
              measurements: {
                create: measurements,
              },
            }
          : {}),
      },
      select: progressEntrySelect,
    });
  } catch {
    throw new databaseError(
      "Database error occurred while creating the progress entry."
    );
  }
}

// Current body progress belongs to the user's BodyProfile.
export async function findLatestProgressEntryByUserId(
  userId,
  db = prisma
) {
  try {
    return await db.progressEntry.findFirst({
      where: { bodyProfileId: userId },
      select: progressEntrySelect,
      orderBy: [{ recordedAt: "desc" }, { createdAt: "desc" }],
    });
  } catch {
    throw new databaseError(
      "Database error occurred while finding the latest progress entry."
    );
  }
}

// Get the progress history for a user, optionally filtered by date range and paginated.
export async function findProgressHistoryByUserId(
  userId,
  query,
  db = prisma
) {
  const { page = 1, limit = 20, startDate, endDate } = query;
  const skip = (page - 1) * limit;

  const where = {
    bodyProfileId: userId,
  };

  if (startDate || endDate) {
    where.recordedAt = {};

    if (startDate) {
      where.recordedAt.gte = new Date(`${startDate}T00:00:00.000Z`);
    }

    if (endDate) {
      const nextDay = new Date(`${endDate}T00:00:00.000Z`);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      where.recordedAt.lt = nextDay;
    }
  }

  try {
    const [progressEntries, totalItems] = await Promise.all([
      db.progressEntry.findMany({
        where,
        orderBy: [{ recordedAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
        select: progressEntrySelect,
      }),
      db.progressEntry.count({
        where,
      }),
    ]);

    return {
      progressEntries,
      totalItems,
    };
  } catch {
    throw new databaseError(
      "Database error occurred while fetching progress history."
    );
  }
}

// Find a single progress entry by ID owned by the user.
export async function findProgressEntryById(
  entryId,
  userId,
  db = prisma
) {
  try {
    return await db.progressEntry.findFirst({
      where: { id: entryId, bodyProfileId: userId },
      select: progressEntrySelect,
    });
  } catch {
    throw new databaseError(
      "Database error occurred while finding the progress entry."
    );
  }
}