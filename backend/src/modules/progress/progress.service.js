import {
  ActiveGoalRequiredError,
  BodyProfileNotFoundError,
  InvalidProgressDateError,
  ProfileIncompleteError,
  ProgressEntryNotFoundError,
} from "../../middlewares/errorHandling.js";
import { findActiveGoalByUserId } from "../goals/goal.repository.js";
import { findBodyProfileByUserId } from "../profiles/profile.repository.js";
import * as progressRepo from "./progress.repository.js";
import * as progressSerializer from "./progress.serializer.js";
import {
  buildGoalProgress,
  buildProgressDateRange,
} from "./progress.rules.js";

export async function createProgressEntry(progressData, userId, db) {
  const bodyProfile = await findBodyProfileByUserId(userId, db);
  if (!bodyProfile) throw new BodyProfileNotFoundError();

  const recordedAt = progressData.recordedAt ?? new Date();

  const latestEntry = await progressRepo.findLatestProgressEntryByUserId(
    userId,
    db
  );

  if (
    latestEntry &&
    new Date(recordedAt).getTime() < new Date(latestEntry.recordedAt).getTime()
  ) {
    throw new InvalidProgressDateError();
  }

  // Goal ownership never comes from the request. Link only to the
  // authenticated user's active goal when one exists.
  const activeGoal = await findActiveGoalByUserId(userId, db);

  const newEntry = await progressRepo.createProgressEntry(
    {
      ...progressData,
      recordedAt,
      ...(activeGoal ? { goalId: activeGoal.id } : {}),
    },
    userId,
    db
  );

  return progressSerializer.serializeProgressEntry(newEntry);
}

export async function getProgressHistory(userId, query, timezone, db) {
  const dateRange = buildProgressDateRange(query, timezone);
  const { progressEntries, totalItems } =
    await progressRepo.findProgressHistoryByUserId(
      userId,
      { page: query.page, limit: query.limit, dateRange },
      db
    );

  const totalPages = Math.ceil(totalItems / query.limit);

  return {
    items: progressEntries.map(progressSerializer.serializeProgressEntry),
    pagination: {
      page: query.page,
      limit: query.limit,
      totalItems,
      totalPages,
      hasPreviousPage: query.page > 1,
      hasNextPage: query.page < totalPages,
    },
  };
}

export async function getLatestProgressEntry(userId, db) {
  const latestEntry = await progressRepo.findLatestProgressEntryByUserId(
    userId,
    db
  );

  if (!latestEntry) {
    return null;
  }

  return progressSerializer.serializeProgressEntry(latestEntry);
}

export async function getProgressEntryById(userId, entryId, db) {
  const entry = await progressRepo.findProgressEntryById(entryId, userId, db);

  if (!entry) {
    throw new ProgressEntryNotFoundError();
  }

  return progressSerializer.serializeProgressEntry(entry);
}
export async function getGoalProgress(userId, db) {
  const activeGoal = await findActiveGoalByUserId(userId, db);
  if (!activeGoal) throw new ActiveGoalRequiredError();

  const { startingEntry, currentEntry } =
    await progressRepo.findGoalProgressEntries(userId, activeGoal, db);

  if (!startingEntry || !currentEntry) {
    throw new ProfileIncompleteError([
      {
        field: "currentWeightKg",
        message: "Record your weight before viewing goal progress.",
      },
    ]);
  }

  return buildGoalProgress(activeGoal, startingEntry, currentEntry);
}
