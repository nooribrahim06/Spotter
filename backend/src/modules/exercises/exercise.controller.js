import * as exerciseService from "./exercise.service.js";

function privateResponse(res, statusCode, data) {
  res.set("Cache-Control", "no-store");
  return res.status(statusCode).json({ data });
}

export function getExerciseConfigController(req, res) {
  return privateResponse(res, 200, exerciseService.getExerciseConfig());
}

export async function listExercisesController(req, res) {
  const result = await exerciseService.listExercises(req.validatedQuery);
  return privateResponse(res, 200, result);
}

export async function getExerciseByIdController(req, res) {
  const result = await exerciseService.getExerciseById(
    req.validatedParams.exerciseId
  );
  return privateResponse(res, 200, result);
}
