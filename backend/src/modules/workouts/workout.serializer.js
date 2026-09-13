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
    createdAt: workout.createdAt,
    updatedAt: workout.updatedAt,
  };
}
