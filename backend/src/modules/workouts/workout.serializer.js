import { serializeWorkoutExercise } from "../workout-exercises/workoutExercise.serializer.js";

export function serializeWorkout(workout) {
  return {
    id: workout.id,
    name: workout.name,
    status: workout.status,
    startedAt: workout.startedAt,
    completedAt: workout.completedAt,
    durationMinutes: workout.durationMinutes,
    estimatedCaloriesBurned: workout.estimatedCaloriesBurned,
    notes: workout.notes,
    exercises: workout.exercises.map(serializeWorkoutExercise),
    // Plan provenance – present only when the workout was started from a plan
    sourcePlanWorkoutId: workout.sourcePlanWorkoutId ?? null,
    scheduledDate: workout.scheduledDate ?? null,
    createdAt: workout.createdAt,
    updatedAt: workout.updatedAt,
  };
}
