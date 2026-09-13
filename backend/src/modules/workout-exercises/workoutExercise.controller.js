import * as service from "./workoutExercise.service.js";

function privateResponse(res, statusCode, data) {
  res.set("Cache-Control", "no-store");
  return res.status(statusCode).json({ data });
}

export async function addWorkoutExerciseController(req, res) {
  const result = await service.addWorkoutExercise(
    req.user.id,
    req.validatedParams.workoutId,
    req.validatedBody
  );
  return privateResponse(res, 201, result);
}

export async function updateWorkoutExerciseController(req, res) {
  const result = await service.updateWorkoutExercise(
    req.user.id,
    req.validatedParams.workoutId,
    req.validatedParams.workoutExerciseId,
    req.validatedBody
  );
  return privateResponse(res, 200, result);
}

export async function deleteWorkoutExerciseController(req, res) {
  await service.removeWorkoutExercise(
    req.user.id,
    req.validatedParams.workoutId,
    req.validatedParams.workoutExerciseId
  );
  return res.status(204).send();
}
