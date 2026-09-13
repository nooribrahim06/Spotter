export const MAX_WORKOUT_EXERCISES = 50;
export const WORKOUT_EXERCISE_LIMITS = {
  setsCount: 100,
  repsPerSet: 1000,
  weightKg: 1500,
  durationSeconds: 86400,
  distanceMeters: 1000000,
};

// Exercise.trackingMetrics is the source of truth for both the UI and backend.
// Each catalog metric maps to the field stored on WorkoutExercise.
const TRACKING_FIELDS = {
  SETS: { field: "setsCount", label: "Sets" },
  REPS: { field: "repsPerSet", label: "Repetitions" },
  WEIGHT: { field: "weightKg", label: "Weight" },
  DURATION: { field: "durationSeconds", label: "Duration" },
  DISTANCE: { field: "distanceMeters", label: "Distance" },
};

export function getMeasurementIssues(item, trackingMetrics) {
  const issues = [];

  if (!Array.isArray(trackingMetrics) || trackingMetrics.length === 0) {
    issues.push({
      field: "exerciseId",
      message: "This exercise has no configured tracking metrics.",
    });

    return issues;
  }

  const requiredMetrics = new Set(trackingMetrics);

  for (const [metric, { field, label }] of Object.entries(TRACKING_FIELDS)) {
    if (requiredMetrics.has(metric) && item[field] == null) {
      issues.push({
        field,
        message: `${label} is required for this exercise.`,
      });
    }

    if (!requiredMetrics.has(metric) && item[field] != null) {
      issues.push({
        field,
        message: `${label} is not tracked for this exercise.`,
      });
    }
  }

  return issues;
}
