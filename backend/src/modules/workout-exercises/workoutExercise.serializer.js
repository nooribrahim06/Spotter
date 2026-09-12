import { serializeExerciseDetails } from "../exercises/exercise.serializer.js";

function decimalToNumber(value) {
  return value === null ? null : Number(value);
}

export function serializeWorkoutExercise(item) {
  return {
    id: item.id,
    exerciseOrder: item.exerciseOrder,
    setsCount: item.setsCount,
    repsPerSet: item.repsPerSet,
    weightKg: decimalToNumber(item.weightKg),
    durationSeconds: item.durationSeconds,
    distanceMeters: decimalToNumber(item.distanceMeters),
    completed: item.completed,
    notes: item.notes,
    exercise: serializeExerciseDetails(item.exercise),
  };
}
