import { prisma } from "../../lib/prisma.js";
import { databaseError } from "../../middlewares/errorHandling.js";

const workoutInclude = {
  exercises: {
    orderBy: { exerciseOrder: "asc" },
    include: { exercise: true },
  },
};

export async function findActiveWorkoutByUserId(userId, db = prisma) {
  try {
    return await db.workout.findFirst({
      where: {
        userId,
        status: "IN_PROGRESS",
      },
    });
  } catch {
    throw new databaseError(
      "Database error occurred while finding the active workout."
    );
  }
}

export async function insertWorkout(userId, workoutData, db = prisma) {
  try {
    return await db.workout.create({
      data: {
        userId,
        name: workoutData.name ?? null,
        notes: workoutData.notes ?? null,
        ...(workoutData.startedAt
          ? { startedAt: workoutData.startedAt }
          : {}),
      },
    });
  } catch {
    throw new databaseError(
      "Database error occurred while creating the workout."
    );
  }
}

export async function findActiveWorkoutDetailsByUserId(
  userId,
  db = prisma
) {
  try {
    return await db.workout.findFirst({
      where: { userId, status: "IN_PROGRESS" },
      include: workoutInclude,
      orderBy: { startedAt: "desc" },
    });
  } catch {
    throw new databaseError(
      "Database error occurred while finding the active workout."
    );
  }
}

export async function findWorkoutHistory(userId, query, db = prisma) {
  const startedAt = {
    ...(query.from ? { gte: query.from } : {}),
    ...(query.to ? { lte: query.to } : {}),
  };
  const where = {
    userId,
    status: { in: ["COMPLETED", "CANCELLED"] },
    ...(Object.keys(startedAt).length > 0 ? { startedAt } : {}),
  };

  try {
    const [workouts, totalItems] = await Promise.all([
      db.workout.findMany({
        where,
        include: workoutInclude,
        orderBy: [{ startedAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      db.workout.count({ where }),
    ]);

    return { workouts, totalItems };
  } catch {
    throw new databaseError(
      "Database error occurred while finding workout history."
    );
  }
}

export async function findWorkoutByIdForUser(
  workoutId,
  userId,
  db = prisma
) {
  try {
    return await db.workout.findFirst({
      where: { id: workoutId, userId },
      include: workoutInclude,
    });
  } catch {
    throw new databaseError(
      "Database error occurred while finding the workout."
    );
  }
}

// A unique workout ID means updateManyAndReturn changes at most one row. The
// status condition makes the state transition atomic without a transaction.
async function changeActiveWorkout(
  workoutId,
  userId,
  data,
  db,
  additionalWhere = {}
) {
  // updatemany and return is used to ensure that the workout is still active and belongs to the user
  // it is an atomic operation that will return the updated workout if it was successful, or null if it was not

  // it may fail beacuse the workout was completed or cancelled by another request
  //  or because the workout does not belong to the user
  // AKA  race conditions 
  const workouts = await db.workout.updateManyAndReturn({
    where: {
      id: workoutId,
      userId,
      status: "IN_PROGRESS",
      ...additionalWhere,
    },
    data,
    include: workoutInclude,
    limit: 1,
  });

  return workouts[0] ?? null;
}

export async function updateActiveWorkoutDetails(
  workoutId,
  userId,
  data,
  db = prisma
) {
  try {
    return await changeActiveWorkout(workoutId, userId, data, db);
  } catch {
    throw new databaseError(
      "Database error occurred while updating the workout."
    );
  }
}

export async function completeActiveWorkout(
  workoutId,
  userId,
  completion,
  db = prisma
) {
  try {
    return await changeActiveWorkout(
      workoutId,
      userId,
      { status: "COMPLETED", ...completion },
      db,
      { exercises: { some: { completed: true } } }
    );
  } catch {
    throw new databaseError(
      "Database error occurred while completing the workout."
    );
  }
}

export async function cancelActiveWorkout(workoutId, userId, db = prisma) {
  try {
    return await changeActiveWorkout(
      workoutId,
      userId,
      {
        status: "CANCELLED",
        completedAt: null,
        durationMinutes: null,
        estimatedCaloriesBurned: null,
      },
      db
    );
  } catch {
    throw new databaseError(
      "Database error occurred while cancelling the workout."
    );
  }
}
