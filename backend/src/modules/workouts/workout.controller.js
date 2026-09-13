import {
  cancelWorkout,
  completeWorkout,
  createWorkout,
  getActiveWorkout,
  getWorkoutById,
  getWorkoutHistory,
  updateWorkout,
} from "./workout.service.js";

function privateResponse(res, statusCode, data) {
  res.set("Cache-Control", "no-store");
  return res.status(statusCode).json({ data });
}

export async function createWorkoutController(req, res) {
  const workout = await createWorkout(req.user.id, req.validatedBody);

  return privateResponse(res, 201, workout);
}

export async function getActiveWorkoutController(req, res) {
  const workout = await getActiveWorkout(req.user.id);
  return privateResponse(res, 200, workout);
}

export async function getWorkoutHistoryController(req, res) {
  const result = await getWorkoutHistory(
    req.user.id,
    req.validatedQuery
  );
  return privateResponse(res, 200, result);
}

export async function getWorkoutByIdController(req, res) {
  const workout = await getWorkoutById(
    req.user.id,
    req.validatedParams.workoutId
  );
  return privateResponse(res, 200, workout);
}

export async function updateWorkoutController(req, res) {
  const workout = await updateWorkout(
    req.user.id,
    req.validatedParams.workoutId,
    req.validatedBody
  );
  return privateResponse(res, 200, workout);
}

export async function completeWorkoutController(req, res) {
  const workout = await completeWorkout(
    req.user.id,
    req.validatedParams.workoutId
  );
  return privateResponse(res, 200, workout);
}

export async function cancelWorkoutController(req, res) {
  const workout = await cancelWorkout(
    req.user.id,
    req.validatedParams.workoutId
  );
  return privateResponse(res, 200, workout);
}
