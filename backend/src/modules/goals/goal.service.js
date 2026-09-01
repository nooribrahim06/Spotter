
import {
  ActiveGoalExistsError,
  GoalNotFoundError,
  GoalTypeChangeRequiredError,
  InvalidGoalStateError,
} from "../../middlewares/errorHandling.js";
import * as goalsRepo from "./goal.repository.js";
import * as progressRepo from "../progress/progress.repository.js";
import {
  serializeActiveGoal,
  serializeGoal,
} from "./goal.serializer.js";

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

  const activatedGoal = await goalsRepo.activateGoal(goalId, userId, db);
  return serializeGoal(activatedGoal);
}

export async function getAllGoals(userId, db) {
  const goals = await goalsRepo.findAllGoalsByUserId(userId, db);
  return goals.map(serializeGoal);
}

export async function getActiveGoal(userId, db) {
  const goal = await goalsRepo.findActiveGoalByUserId(userId, db);
  if (!goal) return null;

  const currentProgress =
    await progressRepo.findLatestProgressEntryByUserId(userId, db);
  return serializeActiveGoal(goal, currentProgress);
}

export async function getGoalById(userId, goalId, db) {
  const goal = await goalsRepo.findGoalByIdForUser(goalId, userId, db);
  if (!goal) throw new GoalNotFoundError();
  return serializeGoal(goal);
}
export async function updateGoal(userId, goalId, data, db) {
  const goal = await goalsRepo.findGoalByIdForUser(goalId, userId, db);
  if (!goal) throw new GoalNotFoundError();
  if (goal.status !== "DRAFT") {
    throw new InvalidGoalStateError("Only a draft goal can be edited.");
  }
  // object.hasOwn is used to check if the property exists in the object, even if its value is null or undefined. 
  // This is important for distinguishing between a property that was intentionally set to null and a property that was never set at all.
  const targetWeightWasEdited = Object.hasOwn(data, "targetWeightKg"); // if the user changed the goal type it may make this to null 
  // like maintain weight goal type requires target weight to be null, and lose/gain weight goal types require target weight to be non-null.
  const goalTypeWasEdited = Object.hasOwn(data, "goalType");



  // Determine the next values for the goal type and target weight
  const nextGoalType = data.goalType ?? goal.goalType;
  const nextTargetWeight = targetWeightWasEdited
    ? data.targetWeightKg
    : goal.targetWeightKg;
  const requiresTargetWeight =
    nextGoalType === "LOSE_WEIGHT" || nextGoalType === "GAIN_WEIGHT";
  // this means the user is trying to change the goal type 
  // while the value of the next target weight is null 
  // which is not allwoed 
  if (requiresTargetWeight && nextTargetWeight == null) {
    // this is only for printing a more specific error message to the user
    // so we tell him he is trying to edit the target weight without changing the goal type which is not allowed
    if (targetWeightWasEdited && !goalTypeWasEdited) {
      throw new GoalTypeChangeRequiredError(
        "This goal type requires a target weight. Change goalType and try again."
      );
    }
    // this is the general mssg 
    // so if the user is trying to change the goal type to a weight loss or gain goal without providing a target weight, we throw this error
    throw new InvalidGoalStateError(
      "Provide targetWeightKg when changing to a weight-loss or weight-gain goal."
    );
  }
  // the front end is responsible for this validation but we are double checking here to make sure the user is not trying 
  // to set a target weight for a maintenance goal type which is not allowed
  if (nextGoalType === "MAINTAIN_WEIGHT" && nextTargetWeight != null) {
    if (targetWeightWasEdited && !goalTypeWasEdited) {
      throw new GoalTypeChangeRequiredError(
        "A maintenance goal cannot have a target weight. Change goalType and try again."
      );
    }

    throw new InvalidGoalStateError(
      "Set targetWeightKg to null when changing to a maintenance goal."
    );
  }

  const updatedGoal = await goalsRepo.updateGoal(
    goalId,
    userId,
    data,
    db
  );
  return serializeGoal(updatedGoal);
}

export async function completeGoal(userId, goalId, db) {
  const goal = await goalsRepo.findGoalByIdForUser(goalId, userId, db);
  if (!goal) throw new GoalNotFoundError();
  if (goal.status !== "ACTIVE") {
    throw new InvalidGoalStateError("Only an active goal can be completed.");
  }

  const completedGoal = await goalsRepo.completeGoal(goalId, userId, db);
  return serializeGoal(completedGoal);
}

export async function cancelGoal(userId, goalId, db) {
  const goal = await goalsRepo.findGoalByIdForUser(goalId, userId, db);
  if (!goal) throw new GoalNotFoundError();
  if (!["DRAFT", "ACTIVE"].includes(goal.status)) {
    throw new InvalidGoalStateError(
      "Only a draft or active goal can be cancelled."
    );
  }

  const cancelledGoal = await goalsRepo.cancelGoal(goalId, userId, db);
  return serializeGoal(cancelledGoal);
}
