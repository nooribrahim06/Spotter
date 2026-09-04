import {
  ActiveWorkoutExistsError,
  InvalidWorkoutStartTimeError,
  WorkoutNotFoundError,
} from "../../middlewares/errorHandling.js";
import {
  findActiveWorkoutByUserId,
  findActiveWorkoutDetailsByUserId,
  insertWorkout,
  findWorkoutByIdForUser,
  findWorkoutHistory,
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

  return insertWorkout(userId, data, db);
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
