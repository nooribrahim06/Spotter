import {
  DuplicateWorkoutExerciseError,
  ExerciseNotFoundError,
  InvalidWorkoutExerciseError,
  InvalidWorkoutStateError,
  WorkoutExerciseLimitError,
  WorkoutExerciseNotFoundError,
  WorkoutNotFoundError,
} from "../../middlewares/errorHandling.js";
import * as repository from "./workoutExercise.repository.js";
import { getMeasurementIssues } from "./workoutExercise.rules.js";
import { serializeWorkoutExercise } from "./workoutExercise.serializer.js";

async function requireMutableWorkout(userId, workoutId, db) {
  const workout = await repository.findOwnedWorkoutIdentity(
    workoutId,
    userId,
    db
  );

  if (!workout) throw new WorkoutNotFoundError();
  if (workout.status !== "IN_PROGRESS") {
    throw new InvalidWorkoutStateError();
  }

  return workout;
}

function assertValidMeasurements(item, trackingMetrics) {
  const issues = getMeasurementIssues(item, trackingMetrics);
  if (issues.length > 0) throw new InvalidWorkoutExerciseError(issues);
}

function handleMutationOutcome(result) {
  if (result.outcome === "WORKOUT_NOT_ACTIVE") {
    throw new InvalidWorkoutStateError();
  }
  if (result.outcome === "NOT_FOUND") {
    throw new WorkoutExerciseNotFoundError();
  }
}

export async function addWorkoutExercise(userId, workoutId, input, db) {
  // first we check if the workout is mutable (in progress) and owned by the user
  // then we cehck if the exercise is active and exists
  // then we check if the measurements are valid
  // then we add the workout exercise to the workout
  // then we handle the outcome of the mutation and throw errors if needed
  // what is even a mutation?
  // a mutation is a change to the database, in this case adding a workout exercise to a workout
  // what is even a mutation outcome ? 
  // it is the result of the mutation that can be : WORKOUT_NOT_ACTIVE , NOT_FOUND , DUPLICATE , LIMIT_REACHED
  // mutation outcome can be : WORKOUT_NOT_ACTIVE , NOT_FOUND , DUPLICATE , LIMIT_REACHED
  await requireMutableWorkout(userId, workoutId, db);

  const exercise = await repository.findActiveExerciseIdentity(
    input.exerciseId,
    db
  );
  if (!exercise) throw new ExerciseNotFoundError();

  assertValidMeasurements(input, exercise.trackingMetrics);

  const result = await repository.addWorkoutExercise(
    workoutId,
    userId,
    input,
    db
  );
  handleMutationOutcome(result);

  if (result.outcome === "DUPLICATE") {
    throw new DuplicateWorkoutExerciseError();
  }
  if (result.outcome === "LIMIT_REACHED") {
    throw new WorkoutExerciseLimitError();
  }

  return serializeWorkoutExercise(result.item);
}

export async function updateWorkoutExercise(
  userId,
  workoutId,
  workoutExerciseId,
  input,
  db
) {
  await requireMutableWorkout(userId, workoutId, db);

  const current = await repository.findWorkoutExercise(
    workoutExerciseId,
    workoutId,
    db
  );
  if (!current) throw new WorkoutExerciseNotFoundError();

  // Validate the final record, not only the submitted patch. This allows a
  // completed-only patch while still preventing invalid measurement states.
  assertValidMeasurements(
    { ...current, ...input },
    current.exercise.trackingMetrics
  );

  const result = await repository.updateWorkoutExercise(
    workoutId,
    workoutExerciseId,
    userId,
    input,
    db
  );
  handleMutationOutcome(result);

  return serializeWorkoutExercise(result.item);
}

export async function removeWorkoutExercise(
  userId,
  workoutId,
  workoutExerciseId,
  db
) {
  await requireMutableWorkout(userId, workoutId, db);

  const result = await repository.deleteWorkoutExercise(
    workoutId,
    workoutExerciseId,
    userId,
    db
  );
  handleMutationOutcome(result);
}
