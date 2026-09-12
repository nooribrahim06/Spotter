import {
  ActiveWorkoutExistsError,
  InvalidWorkoutStartTimeError,
  InvalidWorkoutStateError,
  WorkoutCompletionRequiredError,
  WorkoutNotFoundError,
} from "../../middlewares/errorHandling.js";
import {
  cancelActiveWorkout,
  completeActiveWorkout,
  findActiveWorkoutByUserId,
  findActiveWorkoutDetailsByUserId,
  insertWorkout,
  findWorkoutByIdForUser,
  findWorkoutHistory,
  updateActiveWorkoutDetails,
} from "./workout.repository.js";
import { serializeWorkout } from "./workout.serializer.js";

export async function createWorkout(userId, data, db) {
  if (data.startedAt && data.startedAt > new Date()) {
    throw new InvalidWorkoutStartTimeError();
  }

  const activeWorkout = await findActiveWorkoutByUserId(userId, db);

  if (activeWorkout) {
    throw new ActiveWorkoutExistsError();
  }

  const workout = await insertWorkout(userId, data, db);

  // A new workout cannot contain exercises yet. Adding the empty relation here
  // lets creation use the same safe public serializer as every workout read,
  // without making a redundant database query for an always-empty collection.
  return serializeWorkout({ ...workout, exercises: [] });
}

export async function getActiveWorkout(userId, db) {
  const workout = await findActiveWorkoutDetailsByUserId(userId, db);
  return workout ? serializeWorkout(workout) : null;
}

export async function getWorkoutHistory(userId, query, db) {
  const { workouts, totalItems } = await findWorkoutHistory(
    userId,
    query,
    db
  );
  const totalPages = Math.ceil(totalItems / query.limit);

  return {
    items: workouts.map(serializeWorkout),
    pagination: {
      page: query.page,
      limit: query.limit,
      totalItems,
      totalPages,
      hasPreviousPage: query.page > 1,
      hasNextPage: query.page < totalPages,
    },
  };
}

export async function getWorkoutById(userId, workoutId, db) {
  const workout = await findWorkoutByIdForUser(workoutId, userId, db);

  if (!workout) throw new WorkoutNotFoundError();

  return serializeWorkout(workout);
}

async function requireActiveWorkout(userId, workoutId, db) {
  const workout = await findWorkoutByIdForUser(workoutId, userId, db);

  if (!workout) throw new WorkoutNotFoundError();
  if (workout.status !== "IN_PROGRESS") {
    throw new InvalidWorkoutStateError();
  }

  return workout;
}

function requireSuccessfulStateChange(workout) {
  if (!workout) {
    throw new InvalidWorkoutStateError(
      "The workout changed before this action completed. Refresh and try again."
    );
  }
}

export async function updateWorkout(userId, workoutId, data, db) {
  // the flow is 
  // 1. check if the workout exists and is active
  // 2. update it if exists
  // 3. check for race contidions and throw error if the workout is no longer active
  await requireActiveWorkout(userId, workoutId, db);

  const workout = await updateActiveWorkoutDetails(
    workoutId,
    userId,
    data,
    db
  );
  requireSuccessfulStateChange(workout);

  return serializeWorkout(workout);
}

export async function completeWorkout(userId, workoutId, db) {
  const current = await requireActiveWorkout(userId, workoutId, db);

  if (!current.exercises.some((exercise) => exercise.completed)) {
    throw new WorkoutCompletionRequiredError();
  }

  // The server owns completion time and derives duration from the trusted start.
  const completedAt = new Date();
  const elapsedMilliseconds = completedAt.getTime() - current.startedAt.getTime();
  const durationMinutes = Math.max(
    1,
    Math.ceil(elapsedMilliseconds / 60_000)
  );
  const workout = await completeActiveWorkout(
    workoutId,
    userId,
    { completedAt, durationMinutes },
    db
  );
  requireSuccessfulStateChange(workout);

  return serializeWorkout(workout);
}

export async function cancelWorkout(userId, workoutId, db) {
  await requireActiveWorkout(userId, workoutId, db);

  const workout = await cancelActiveWorkout(workoutId, userId, db);
  requireSuccessfulStateChange(workout);

  return serializeWorkout(workout);
}
