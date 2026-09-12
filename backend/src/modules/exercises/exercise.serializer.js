import { cloudinary } from "../../config/cloudinary.js";

function serializeExerciseMedia(gifPublicId) {
  if (!gifPublicId) {
    return {
      previewUrl: null,
      animationUrl: null,
    };
  }

  // Only the backend understands Cloudinary transformations. The frontend gets
  // complete delivery URLs and never needs the cloud name or storage key.
  return {
    previewUrl: cloudinary.url(gifPublicId, {
      secure: true,
      format: "jpg",
      transformation: [{ page: 1 }],
      analytics: false,
    }),
    animationUrl: cloudinary.url(gifPublicId, {
      secure: true,
      format: "gif",
      analytics: false,
    }),
  };
}

function serializeExerciseBase(exercise) {
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
    trackingMetrics: exercise.trackingMetrics,
    media: serializeExerciseMedia(exercise.gifPublicId),
  };
}

export function serializeExerciseSummary(exercise) {
  return serializeExerciseBase(exercise);
}

export function serializeExerciseDetails(exercise) {
  return {
    ...serializeExerciseBase(exercise),
    instructions: exercise.instructions,
  };
}
