import { prisma } from "../../lib/prisma.js";
import { databaseError } from "../../middlewares/errorHandling.js";

// Keep projections separate from queries so the context contract is easy to
// review. Account credentials and unrelated identity fields are not needed.
const userSelect = {
  id: true,
  timezone: true,
  updatedAt: true,
};

const bodyProfileSelect = {
  userId: true,
  birthDate: true,
  sexForCalculation: true,
  heightCm: true,
  activityLevel: true,
  updatedAt: true,
};

const latestProgressSelect = {
  id: true,
  recordedAt: true,
  weightKg: true,
  bodyFatPercentage: true,
  createdAt: true,
};

const goalSelect = {
  id: true,
  goalType: true,
  status: true,
  targetWeightKg: true,
  targetDate: true,
  updatedAt: true,
};

const healthProfileSelect = {
  healthConditions: true,
  movementLimitations: true,
  specialPlanningStates: true,
  requiresProfessionalClearance: true,
  safetyNotes: true,
  updatedAt: true,
};

const nutritionProfileSelect = {
  dietaryPreferenceCodes: true,
  foodAllergies: true,
  foodIntolerances: true,
  foodPreferences: true,
  mealsPerDay: true,
  snacksPerDay: true,
  planStyle: true,
  cookingSkill: true,
  maxMealPrepMinutes: true,
  kitchenAccess: true,
  foodBudgetLevel: true,
  updatedAt: true,
};

const trainingProfileSelect = {
  overallExperienceLevel: true,
  resistanceTrainingLevel: true,
  cardioTrainingLevel: true,
  trainingDaysPerWeek: true,
  availableDays: true,
  preferredSessionMinutes: true,
  trainingEnvironment: true,
  availableEquipment: true,
  preferredTrainingStyles: true,
  preferredCardioType: true,
  updatedAt: true,
};

// Each private profile is keyed by the owner's BodyProfile.userId.
// Return the same names consumed by plan.rules.js and plan.service.js.
export async function getPlanGenerationSourceData(userId, db = prisma) {
  try {
    const [
      user,
      bodyProfile,
      latestProgress,
      goal,
      healthProfile,
      nutritionProfile,
      trainingProfile,
    ] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: userSelect,
      }),
      db.bodyProfile.findUnique({
        where: { userId },
        select: bodyProfileSelect,
      }),
      db.progressEntry.findFirst({
        where: { bodyProfileId: userId },
        select: latestProgressSelect,
        // A backdated check-in entered today must not replace a newer reading.
        orderBy: [
          { recordedAt: "desc" },
          { createdAt: "desc" },
          { id: "desc" },
        ],
      }),
      db.goal.findFirst({
        where: { userId, status: "ACTIVE" },
        select: goalSelect,
      }),
      db.healthProfile.findUnique({
        where: { bodyProfileId: userId },
        select: healthProfileSelect,
      }),
      db.nutritionProfile.findUnique({
        where: { bodyProfileId: userId },
        select: nutritionProfileSelect,
      }),
      db.trainingProfile.findUnique({
        where: { bodyProfileId: userId },
        select: trainingProfileSelect,
      }),
    ]);

    return {
      user,
      bodyProfile,
      latestProgress,
      goal,
      healthProfile,
      nutritionProfile,
      trainingProfile,
    };
  } catch {
    throw new databaseError(
      "Database error occurred while fetching plan generation source data."
    );
  }
}
