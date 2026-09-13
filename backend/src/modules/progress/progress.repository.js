import { prisma } from "../../lib/prisma.js";
import {
  BodyProfileNotFoundError,
  databaseError,
} from "../../middlewares/errorHandling.js";

const progressEntrySelect = {
  id: true,
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
    orderBy: { measurementType: "asc" },
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
  } catch (error) {
    if (error.code === "P2003") throw new BodyProfileNotFoundError();
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
  } catch (error) {
    if (error.code === "P2003") throw new BodyProfileNotFoundError();
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
      orderBy: [
        { recordedAt: "desc" },
        { createdAt: "desc" },
        { id: "desc" },
      ],
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
  const { page = 1, limit = 20, dateRange } = query;
  const skip = (page - 1) * limit;

  const where = {
    bodyProfileId: userId,
    ...(dateRange ? { recordedAt: dateRange } : {}),
  };

  try {
    const [progressEntries, totalItems] = await Promise.all([
      db.progressEntry.findMany({
        where,
        orderBy: [
          { recordedAt: "desc" },
          { createdAt: "desc" },
          { id: "desc" },
        ],
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

// The onboarding baseline is preferred. A regular goal falls back to the
// latest check-in that existed when that goal was activated.
export async function findGoalProgressEntries(
  userId,
  goal,
  db = prisma
) {
  try {
    const [currentEntry, initialEntry] = await Promise.all([
      db.progressEntry.findFirst({
        where: { bodyProfileId: userId },
        select: progressEntrySelect,
        orderBy: [
          { recordedAt: "desc" },
          { createdAt: "desc" },
          { id: "desc" },
        ],
      }),
      db.progressEntry.findFirst({
        where: {
          bodyProfileId: userId,
          goalId: goal.id,
          isInitialForGoal: true,
        },
        select: progressEntrySelect,
      }),
    ]);

    let startingEntry = initialEntry;

    if (!startingEntry && goal.startedAt) {
      startingEntry = await db.progressEntry.findFirst({
        where: {
          bodyProfileId: userId,
          recordedAt: { lte: goal.startedAt },
        },
        select: progressEntrySelect,
        orderBy: [
          { recordedAt: "desc" },
          { createdAt: "desc" },
          { id: "desc" },
        ],
      });
    }

    return { startingEntry, currentEntry };
  } catch {
    throw new databaseError(
      "Database error occurred while calculating goal progress."
    );
  }
}
