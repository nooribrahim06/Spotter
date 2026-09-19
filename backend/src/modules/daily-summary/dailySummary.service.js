import { buildUtcRangeForLocalDates } from "../../helpers/localDateRange.js";
import { DailySummaryTimezoneRequiredError } from "../../middlewares/errorHandling.js";
import * as profileRepository from "../profiles/profile.repository.js";
import { calculateFitnessTargets } from "../profiles/profile.targets.js";
import * as planRepository from "../plans/plan.repository.js";
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
  const [{ meals, workouts }, targetInputs, activePlan] = await Promise.all([
    dailySummaryRepository.findDailyActivity(userId, dateRange, db),
    profileRepository.findTargetInputsForDate(userId, dateRange, db),
    db?.plan && typeof db.plan.findFirst === "function"
      ? planRepository.findPlanForDate(userId, date, db)
      : null,
  ]);
  const profileTargets = calculateTargetsForDate(
    targetInputs.bodyProfile,
    targetInputs.activeGoal,
    date
  );

  const targets = activePlan
    ? {
        dailyCalories: activePlan.calorieTarget,
        proteinGrams: activePlan.proteinTargetGrams,
        carbohydrateGrams: activePlan.carbohydrateTargetGrams,
        fatGrams: activePlan.fatTargetGrams,
        source: "PLAN",
        planId: activePlan.id,
        planTitle: activePlan.title,
        profileTargets: profileTargets
          ? {
              dailyCalories: profileTargets.dailyCalories,
              proteinGrams: profileTargets.proteinGrams,
              carbohydrateGrams: profileTargets.carbohydrateGrams,
              fatGrams: profileTargets.fatGrams,
            }
          : null,
        calculatorVersion: profileTargets?.calculatorVersion ?? null,
        basedOn: profileTargets?.basedOn ?? null,
        disclaimer: profileTargets?.disclaimer ?? null,
      }
    : profileTargets
    ? {
        ...profileTargets,
        source: "PROFILE",
      }
    : null;

  return buildDailySummary({ date, meals, workouts, targets });
}
