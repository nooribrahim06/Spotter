import { prisma } from "../../lib/prisma.js";
import { databaseError } from "../../middlewares/errorHandling.js";

const exerciseSummarySelect = {
  id: true,
  slug: true,
  name: true,
  exerciseType: true,
  bodyPart: true,
  difficulty: true,
  force: true,
  mechanic: true,
  equipment: true,
  primaryMuscles: true,
  secondaryMuscles: true,
  trackingMetrics: true,
  gifPublicId: true,
};

const exerciseDetailsSelect = {
  ...exerciseSummarySelect,
  instructions: true,
};

function buildExerciseWhere({
  search,
  exerciseType,
  bodyPart,
  difficulty,
  force,
  mechanic,
  equipment,
}) {
  // Archived catalog entries must never be available for browsing or logging.
  const where = { isActive: true };

  // Text search can match either the display name or its URL-friendly slug.
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { slug: { contains: search, mode: "insensitive" } },
    ];
  }

  // Prisma combines these top-level fields with AND. For example, selecting
  // CHEST and BEGINNER returns exercises that satisfy both filters.
  if (exerciseType) where.exerciseType = exerciseType;
  if (bodyPart) where.bodyPart = bodyPart;
  if (difficulty) where.difficulty = difficulty;
  if (force) where.force = force;
  if (mechanic) where.mechanic = mechanic;
  if (equipment) where.equipment = equipment;

  return where;
}

export async function findExercises(
  {
    search,
    exerciseType,
    bodyPart,
    difficulty,
    force,
    mechanic,
    equipment,
    page,
    limit,
  },
  db = prisma
) {
  const where = buildExerciseWhere({
    search,
    exerciseType,
    bodyPart,
    difficulty,
    force,
    mechanic,
    equipment,
  });

  try {
    const [exercises, totalItems] = await Promise.all([
      db.exercise.findMany({
        where,
        select: exerciseSummarySelect,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.exercise.count({ where }),
    ]);

    return { exercises, totalItems };
  } catch {
    throw new databaseError(
      "Database error occurred while finding exercises."
    );
  }
}

export async function findActiveExerciseById(exerciseId, db = prisma) {
  try {
    return await db.exercise.findFirst({
      where: { id: exerciseId, isActive: true },
      select: exerciseDetailsSelect,
    });
  } catch {
    throw new databaseError(
      "Database error occurred while finding the exercise."
    );
  }
}
