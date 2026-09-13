import {
  InvalidProgressDateError,
  ProgressEntryNotFoundError,
} from "../../middlewares/errorHandling.js";
import { findActiveGoalByUserId } from "../goals/goal.repository.js";
import * as progressRepo from "./progress.repository.js";
import * as progressSerializer from "./progress.serializer.js";

export async function createProgressEntry(progressData, userId, db) {
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

  // Link to active goal if one exists and goalId isn't explicitly provided
  let goalId = progressData.goalId;
  if (!goalId) {
    const activeGoal = await findActiveGoalByUserId(userId, db);
    if (activeGoal) {
      goalId = activeGoal.id;
    }
  }

  const newEntry = await progressRepo.createProgressEntry(
    {
      ...progressData,
      recordedAt,
      ...(goalId ? { goalId } : {}),
    },
    userId,
    db
  );

  return progressSerializer.serializeProgressEntry(newEntry);
}

export async function getProgressHistory(userId, query, db) {
  const { progressEntries, totalItems } =
    await progressRepo.findProgressHistoryByUserId(userId, query, db);

  const totalPages = Math.ceil(totalItems / query.limit) || 1;

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