import { TARGET_CALCULATION_CONFIG } from "../../config/profile.js";
import {
  serializeDateOnly,
  serializeDecimal,
} from "./profile.serializer.js";

// Age is calculated at the requested date because storing age would become
// incorrect after each birthday and would corrupt historical summaries.
function ageOnDate(birthDate, date) {
  let age = date.getUTCFullYear() - birthDate.getUTCFullYear();
  const birthdayHasPassed =
    date.getUTCMonth() > birthDate.getUTCMonth() ||
    (date.getUTCMonth() === birthDate.getUTCMonth() &&
      date.getUTCDate() >= birthDate.getUTCDate());

  if (!birthdayHasPassed) age -= 1;
  return age;
}
// this is function is responsible of creating the fitness targets based on the user profile, goal and progress entry

// we can replace that in the future with a more complex algorithm that takes into account more factors like body composition, activity level, etc.
// using the model we gonna add more sophisticated calculations
export function calculateFitnessTargets({
  bodyProfile,
  goal,
  progressEntry,
  asOfDate = new Date(),
}) {
  const weightKg = serializeDecimal(progressEntry.weightKg);
  const heightCm = serializeDecimal(bodyProfile.heightCm);
  const age = ageOnDate(bodyProfile.birthDate, asOfDate);
  const sexAdjustment =
    bodyProfile.sexForCalculation === "MALE" ? 5 : -161;

  // Mifflin-St Jeor provides the deterministic MVP baseline.
  const bmr =
    10 * weightKg + 6.25 * heightCm - 5 * age + sexAdjustment;
  const estimatedMaintenance =
    bmr *
    TARGET_CALCULATION_CONFIG.activityFactors[bodyProfile.activityLevel];
  const minimumCalories =
    TARGET_CALCULATION_CONFIG.minimumCalories[
      bodyProfile.sexForCalculation
    ];
  const dailyCalories = Math.round(
    Math.max(
      minimumCalories,
      estimatedMaintenance +
        TARGET_CALCULATION_CONFIG.calorieAdjustments[goal.goalType]
    )
  );

  const proteinMultiplier = [
    "LOSE_WEIGHT",
    "GAIN_WEIGHT",
    "BUILD_MUSCLE",
  ].includes(goal.goalType)
    ? 1.8
    : 1.6;
  const proteinGrams = Math.round(weightKg * proteinMultiplier);
  const fatGrams = Math.round((dailyCalories * 0.25) / 9);
  const carbohydrateGrams = Math.max(
    0,
    Math.round((dailyCalories - proteinGrams * 4 - fatGrams * 9) / 4)
  );

  return {
    dailyCalories,
    proteinGrams,
    carbohydrateGrams,
    fatGrams,
    calculatorVersion: TARGET_CALCULATION_CONFIG.version,
    basedOn: {
      goalId: goal.id,
      goalType: goal.goalType,
      targetWeightKg: serializeDecimal(goal.targetWeightKg),
      targetDate: serializeDateOnly(goal.targetDate),
      weightKg,
      weightRecordedAt: progressEntry.recordedAt,
    },
    disclaimer:
      "These targets are estimates for fitness planning and are not medical advice.",
  };
}
