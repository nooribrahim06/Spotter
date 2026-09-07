function decimalToNumber(value) {
  return value === null ? null : Number(value);
}

function serializeExercise(exercise) {
  return {
    id: exercise.id,
    slug: exercise.slug,
    name: exercise.name,
    exerciseType: exercise.exerciseType,
    bodyPart: exercise.bodyPart,
    difficulty: exercise.difficulty,
    force: exercise.force,
    mechanic: exercise.mechanic,
    equipment: exercise.equipment,
    primaryMuscles: exercise.primaryMuscles,
    secondaryMuscles: exercise.secondaryMuscles,
    instructions: exercise.instructions,
    imageKey: exercise.imageKey,
    gifKey: exercise.gifKey,
  };
}

function serializeWorkoutExercise(item) {
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
    exercise: serializeExercise(item.exercise),
  };
}

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
