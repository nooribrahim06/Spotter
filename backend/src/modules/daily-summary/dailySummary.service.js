import { buildUtcRangeForLocalDates } from "../../helpers/localDateRange.js";
import { DailySummaryTimezoneRequiredError } from "../../middlewares/errorHandling.js";
import * as profileRepository from "../profiles/profile.repository.js";
import { calculateFitnessTargets } from "../profiles/profile.targets.js";
import * as dailySummaryRepository from "./dailySummary.repository.js";
import { buildDailySummary } from "./dailySummary.rules.js";

function buildDateRange(date, timezone) {
  if (!timezone) throw new DailySummaryTimezoneRequiredError();

  try {
    // we sent the same date twice because we want to get the range for that specific date only
    const range = buildUtcRangeForLocalDates(date, date, timezone);
    return { start: range.gte, end: range.lt };
  } catch (error) {
    if (error instanceof RangeError) {
      throw new DailySummaryTimezoneRequiredError(
        "Set a valid IANA timezone before viewing a daily summary."
      );
    }
    throw error;
  }
}

function calculateTargetsForDate(bodyProfile, activeGoal, date) {
  const progressEntry = bodyProfile?.progressEntries?.[0];

  if (
    !bodyProfile ||
    !activeGoal ||
    !bodyProfile.activityLevel ||
    !progressEntry
  ) {
    return null;
  }

  return calculateFitnessTargets({
    bodyProfile,
    goal: activeGoal,
    progressEntry,
    asOfDate: new Date(`${date}T12:00:00.000Z`),
  });
}

export async function getDailySummary(userId, date, timezone, db) {
  const dateRange = buildDateRange(date, timezone);
  const [{ meals, workouts }, targetInputs] = await Promise.all([
    dailySummaryRepository.findDailyActivity(userId, dateRange, db),
    profileRepository.findTargetInputsForDate(userId, dateRange, db),
  ]);
  const targets = calculateTargetsForDate(
    targetInputs.bodyProfile,
    targetInputs.activeGoal,
    date
  );

  return buildDailySummary({ date, meals, workouts, targets });
}
