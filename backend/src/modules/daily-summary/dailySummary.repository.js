import { prisma } from "../../lib/prisma.js";
import { databaseError } from "../../middlewares/errorHandling.js";

export async function findDailyActivity(userId, dateRange, db = prisma) {
  const timeFilter = {
    gte: dateRange.start,
    lt: dateRange.end,
  };

  try {
    const [meals, workouts] = await Promise.all([
      db.meal.findMany({
        where: {
          userId,
          occurredAt: timeFilter,
        },
        select: {
          items: {
            select: {
              calories: true,
              proteinGrams: true,
              carbohydrateGrams: true,
              fatGrams: true,
            },
          },
        },
      }),
      db.workout.findMany({
        where: {
          userId,
          status: { in: ["IN_PROGRESS", "COMPLETED"] },
          startedAt: timeFilter,
        },
        select: {
          status: true,
          estimatedCaloriesBurned: true,
        },
      }),
    ]);

    return { meals, workouts };
  } catch {
    throw new databaseError(
      "Database error occurred while building the daily summary."
    );
  }
}
