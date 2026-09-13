import { exerciseConfig } from "../../config/exercise.js";
import { ExerciseNotFoundError } from "../../middlewares/errorHandling.js";
import * as exerciseRepository from "./exercise.repository.js";
import {
  serializeExerciseDetails,
  serializeExerciseSummary,
} from "./exercise.serializer.js";

export function getExerciseConfig() {
  return exerciseConfig;
}

export async function listExercises(query, db) {
  const { exercises, totalItems } = await exerciseRepository.findExercises(
    query,
    db
  );
  const totalPages = Math.ceil(totalItems / query.limit);

  return {
    items: exercises.map(serializeExerciseSummary),
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

export async function getExerciseById(exerciseId, db) {
  const exercise = await exerciseRepository.findActiveExerciseById(
    exerciseId,
    db
  );

  if (!exercise) throw new ExerciseNotFoundError();

  return serializeExerciseDetails(exercise);
}
