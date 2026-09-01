import * as goalService from "./goal.service.js";

function privateResponse(res, statusCode, data) {
  res.set("Cache-Control", "no-store");
  return res.status(statusCode).json({ data });
}

export async function createGoalController(req, res) {
  const result = await goalService.createGoal(
    req.user.id,
    req.validatedBody
  );
  return privateResponse(res, 201, result);
}

export async function activateGoalController(req, res) {
  const result = await goalService.activateGoal(
    req.user.id,
    req.validatedParams.goalId
  );
  return privateResponse(res, 200, result);
}

export async function getAllGoalsController(req, res) {
    const result = await goalService.getAllGoals(req.user.id);

    return privateResponse(res, 200, result);
}

export async function getActiveGoalController(req, res) {
    const result = await goalService.getActiveGoal(req.user.id);

    return privateResponse(res, 200, result);
}

export async function getGoalByIdController(req, res) {
    const result = await goalService.getGoalById(
        req.user.id,
        req.validatedParams.goalId
    );

    return privateResponse(res, 200, result);
}