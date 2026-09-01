import {
  serializeDateOnly,
  serializeDecimal,
} from "../profiles/profile.serializer.js";
import { serializeProgressEntry } from "../progress/progress.serializer.js";

export function serializeGoal(goal) {
  return {
    id: goal.id,
    goalType: goal.goalType,
    targetWeightKg: serializeDecimal(goal.targetWeightKg),
    targetDate: serializeDateOnly(goal.targetDate),
    status: goal.status,
    startedAt: goal.startedAt,
    completedAt: goal.completedAt,
    cancelledAt: goal.cancelledAt,
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt,
  };
}

export function serializeActiveGoal(goal, currentProgress) {
  return {
    ...serializeGoal(goal),
    currentProgress: serializeProgressEntry(currentProgress),
  };
}
