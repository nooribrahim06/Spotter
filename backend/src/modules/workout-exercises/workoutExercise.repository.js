import { prisma } from "../../lib/prisma.js";
import { databaseError } from "../../middlewares/errorHandling.js";
import { MAX_WORKOUT_EXERCISES } from "./workoutExercise.rules.js";

const workoutExerciseInclude = { exercise: true };
const REORDER_OFFSET = MAX_WORKOUT_EXERCISES + 1;

export async function findOwnedWorkoutIdentity(
  workoutId,
  userId,
  db = prisma
) {
  try {
    return await db.workout.findFirst({
      where: { id: workoutId, userId },
      select: { id: true, status: true },
    });
  } catch {
    throw new databaseError(
      "Database error occurred while checking the workout."
    );
  }
}

export async function findActiveExerciseIdentity(exerciseId, db = prisma) {
  try {
    return await db.exercise.findFirst({
      where: { id: exerciseId, isActive: true },
      select: { id: true, trackingMetrics: true },
    });
  } catch {
    throw new databaseError(
      "Database error occurred while checking the exercise."
    );
  }
}

export async function findWorkoutExercise(
  workoutExerciseId,
  workoutId,
  db = prisma
) {
  try {
    return await db.workoutExercise.findFirst({
      where: { id: workoutExerciseId, workoutId },
      include: {
        exercise: {
          select: { trackingMetrics: true },
        },
      },
    });
  } catch {
    throw new databaseError(
      "Database error occurred while finding the workout exercise."
    );
  }
}

export async function addWorkoutExercise(
  workoutId,
  userId,
  input,
  db = prisma
) {
  try {
    return await db.$transaction(async (tx) => {
      const activeWorkout = await tx.workout.findFirst({
        where: { id: workoutId, userId, status: "IN_PROGRESS" },
        select: { id: true },
      });
      if (!activeWorkout) return { outcome: "WORKOUT_NOT_ACTIVE" };

      const [duplicate, exerciseCount, lastExercise] = await Promise.all([
        tx.workoutExercise.findFirst({
          where: { workoutId, exerciseId: input.exerciseId },
          select: { id: true },
        }),
        tx.workoutExercise.count({ where: { workoutId } }),
        tx.workoutExercise.findFirst({
          where: { workoutId },
          select: { exerciseOrder: true },
          orderBy: { exerciseOrder: "desc" },
        }),
      ]);

      if (duplicate) return { outcome: "DUPLICATE" };
      if (exerciseCount >= MAX_WORKOUT_EXERCISES) {
        return { outcome: "LIMIT_REACHED" };
      }

      const item = await tx.workoutExercise.create({
        data: {
          workoutId,
          exerciseId: input.exerciseId,
          exerciseOrder: (lastExercise?.exerciseOrder ?? 0) + 1,
          setsCount: input.setsCount ?? null,
          repsPerSet: input.repsPerSet ?? null,
          weightKg: input.weightKg ?? null,
          durationSeconds: input.durationSeconds ?? null,
          distanceMeters: input.distanceMeters ?? null,
          notes: input.notes ?? null,
        },
        include: workoutExerciseInclude,
      });

      return { outcome: "CREATED", item };
    });
  } catch (error) {
    if (error?.code === "P2002") return { outcome: "DUPLICATE" };

    throw new databaseError(
      "Database error occurred while adding the workout exercise."
    );
  }
}

export async function updateWorkoutExercise(
  workoutId,
  workoutExerciseId,
  userId,
  input,
  db = prisma
) {
  try {
    return await db.$transaction(async (tx) => {
      const activeWorkout = await tx.workout.findFirst({
        where: { id: workoutId, userId, status: "IN_PROGRESS" },
        select: { id: true },
      });
      if (!activeWorkout) return { outcome: "WORKOUT_NOT_ACTIVE" };

      const updated = await tx.workoutExercise.updateMany({
        where: { id: workoutExerciseId, workoutId },
        data: input,
      });
      if (updated.count === 0) return { outcome: "NOT_FOUND" };

      const item = await tx.workoutExercise.findUnique({
        where: { id: workoutExerciseId },
        include: workoutExerciseInclude,
      });

      return { outcome: "UPDATED", item };
    });
  } catch {
    throw new databaseError(
      "Database error occurred while updating the workout exercise."
    );
  }
}

export async function deleteWorkoutExercise(
  workoutId,
  workoutExerciseId,
  userId,
  db = prisma
) {
  try {
    return await db.$transaction(async (tx) => {
      const activeWorkout = await tx.workout.findFirst({
        where: { id: workoutId, userId, status: "IN_PROGRESS" },
        select: { id: true },
      });
      if (!activeWorkout) return { outcome: "WORKOUT_NOT_ACTIVE" };

      const item = await tx.workoutExercise.findFirst({
        where: { id: workoutExerciseId, workoutId },
        select: { exerciseOrder: true },
      });
      if (!item) return { outcome: "NOT_FOUND" };

      await tx.workoutExercise.delete({
        where: { id: workoutExerciseId },
      });

      // Move later rows temporarily out of the valid range before closing the
      // gap. This avoids collisions with the unique workout/order constraint.
      await tx.workoutExercise.updateMany({
        where: { workoutId, exerciseOrder: { gt: item.exerciseOrder } },
        data: { exerciseOrder: { increment: REORDER_OFFSET } },
      });
      await tx.workoutExercise.updateMany({
        where: {
          workoutId,
          exerciseOrder: { gt: item.exerciseOrder + REORDER_OFFSET },
        },
        data: { exerciseOrder: { decrement: REORDER_OFFSET + 1 } },
      });

      return { outcome: "DELETED" };
    });
  } catch {
    throw new databaseError(
      "Database error occurred while deleting the workout exercise."
    );
  }
}
