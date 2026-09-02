import { InvalidGoalTargetError } from "../../middlewares/errorHandling.js";

const WEIGHT_DIRECTION_GOALS = new Set(["GAIN_WEIGHT", "LOSE_WEIGHT"]);

export function requiresDirectionalTarget(goalType) {
  return WEIGHT_DIRECTION_GOALS.has(goalType);
}

export function assertGoalTargetDirection({
  goalType,
  targetWeightKg,
  currentWeightKg,
}) {
  if (!requiresDirectionalTarget(goalType)) return;
  if (targetWeightKg == null || currentWeightKg == null) return;

  const targetWeight = Number(targetWeightKg);
  const currentWeight = Number(currentWeightKg);

  if (goalType === "GAIN_WEIGHT" && targetWeight <= currentWeight) {
    throw new InvalidGoalTargetError(
      `For a gain-weight goal, targetWeightKg must be greater than your current weight (${currentWeight} kg).`
    );
  }

  if (goalType === "LOSE_WEIGHT" && targetWeight >= currentWeight) {
    throw new InvalidGoalTargetError(
      `For a weight-loss goal, targetWeightKg must be less than your current weight (${currentWeight} kg).`
    );
  }
}
