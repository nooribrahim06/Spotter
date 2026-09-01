
import {
  ActiveGoalExistsError,
  GoalNotFoundError,
  InvalidGoalStateError,
} from "../../middlewares/errorHandling.js";
import * as goalsRepo from "./goal.repository.js";
import { serializeGoal } from "./goal.serializer.js";

export async function createGoal(userId, data, db) {
  // Saving and activation are deliberately separate. A user may save a draft
  // while another goal is active and return to it later without losing data.
  const newGoal = await goalsRepo.createGoal(userId, data, db);
  return serializeGoal(newGoal);
}

export async function activateGoal(userId, goalId, db) {
  const goal = await goalsRepo.findGoalByIdForUser(goalId, userId, db);

  if (!goal) throw new GoalNotFoundError();
  if (goal.status !== "DRAFT") throw new InvalidGoalStateError();

  const activeGoal = await goalsRepo.findActiveGoalByUserId(userId, db);
  if (activeGoal) throw new ActiveGoalExistsError();

  const activatedGoal = await goalsRepo.activateGoal(goalId, db);
  return serializeGoal(activatedGoal);
}
