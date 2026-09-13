import { ProgressTimezoneRequiredError } from "../../middlewares/errorHandling.js";
import { buildUtcRangeForLocalDates } from "../../helpers/localDateRange.js";


// this is have one respnsibility 
// take the query and timezone and return the utc range for the query
// the database only understand the UTC range so we need to convert the local date to UTC range
export function buildProgressDateRange(query, timezone) {
  if (!query.startDate && !query.endDate) return null;
  if (!timezone) throw new ProgressTimezoneRequiredError();

  try {
    // Convert the local start and end dates to UTC range for querying the database
    return buildUtcRangeForLocalDates(
      query.startDate,
      query.endDate,
      timezone
    );
  } catch (error) {
    if (error instanceof RangeError) {
      throw new ProgressTimezoneRequiredError(
        "Set a valid IANA timezone before filtering progress by date."
      );
    }
    throw error;
  }
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
// this is used to build the progress for a goal
// like how many the user has lost or gained and how much is left to reach the goal
export function buildGoalProgress(goal, startingEntry, currentEntry) {
  const startingWeightKg = Number(startingEntry.weightKg);
  const currentWeightKg = Number(currentEntry.weightKg);
  const targetWeightKg =
    goal.targetWeightKg == null ? null : Number(goal.targetWeightKg);
  const weightChangeKg = round(currentWeightKg - startingWeightKg);

  let remainingKg = null;
  let progressPercentage = null;

  if (targetWeightKg != null) {
    const totalDistance = Math.abs(targetWeightKg - startingWeightKg);
    const travelled =
      targetWeightKg < startingWeightKg
        ? startingWeightKg - currentWeightKg
        : currentWeightKg - startingWeightKg;

    remainingKg = round(
      Math.max(
        0,
        targetWeightKg < startingWeightKg
          ? currentWeightKg - targetWeightKg
          : targetWeightKg - currentWeightKg
      )
    );
    progressPercentage =
      totalDistance === 0
        ? 100
        : Math.round(
            Math.min(100, Math.max(0, (travelled / totalDistance) * 100))
          );
  }

  return {
    goal: {
      id: goal.id,
      goalType: goal.goalType,
      targetWeightKg,
      targetDate: goal.targetDate,
      startedAt: goal.startedAt,
    },
    starting: {
      entryId: startingEntry.id,
      weightKg: startingWeightKg,
      recordedAt: startingEntry.recordedAt,
    },
    current: {
      entryId: currentEntry.id,
      weightKg: currentWeightKg,
      recordedAt: currentEntry.recordedAt,
    },
    weightChangeKg,
    remainingKg,
    progressPercentage,
  };
}
