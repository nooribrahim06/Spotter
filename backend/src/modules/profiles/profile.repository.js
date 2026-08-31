import { prisma } from "../../lib/prisma.js";
import {
  BodyProfileAlreadyExistsError,
  BodyProfileNotFoundError,
  databaseError,
} from "../../middlewares/errorHandling.js";

const publicProfileSelect = {
  firstName: true,
  lastName: true,
  displayName: true,
  bio: true,
  profilePhotoKey: true,
  createdAt: true,
  updatedAt: true,
};

const progressEntrySelect = {
  id: true,
  recordedAt: true,
  weightKg: true,
  bodyFatPercentage: true,
  skeletalMuscleMassKg: true,
  restingHeartRateBpm: true,
  notes: true,
  measurements: {
    select: {
      measurementType: true,
      valueCm: true,
    },
    orderBy: { measurementType: "asc" },
  },
};

// One aggregate read is both faster and safer than returning unrestricted rows
// from every table. Passwords, tokens, internal foreign keys, and photo keys are
// intentionally absent from the API-facing object.
export async function findCompleteProfileByUserId(userId, db = prisma) {
  try {
    return await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        language: true,
        country: true,
        timezone: true,
        role: true,
        emailVerified: true,
        onboardingStatus: true,
        onboardingStep: true,
        fitnessOnboardingCompletedAt: true,
        createdAt: true,
        updatedAt: true,
        userProfile: { select: publicProfileSelect },
        coachingPreferences: {
          select: {
            coachingStyle: true,
            explanationLevel: true,
            motivationStyle: true,
            checkinFrequency: true,
            proactiveCoaching: true,
            workoutReminders: true,
            nutritionReminders: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        bodyProfile: {
          select: {
            birthDate: true,
            adultConfirmedAt: true,
            sexForCalculation: true,
            preferredUnitSystem: true,
            heightCm: true,
            startingWeightKg: true,
            activityLevel: true,
            createdAt: true,
            updatedAt: true,
            healthProfile: {
              select: {
                healthConditions: true,
                movementLimitations: true,
                specialPlanningStates: true,
                requiresProfessionalClearance: true,
                safetyNotes: true,
                createdAt: true,
                updatedAt: true,
              },
            },
            nutritionProfile: {
              select: {
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
                createdAt: true,
                updatedAt: true,
              },
            },
            trainingProfile: {
              select: {
                overallExperienceLevel: true,
                resistanceTrainingLevel: true,
                cardioTrainingLevel: true,
                currentlyTrainingConsistently: true,
                trainingDaysPerWeek: true,
                availableDays: true,
                preferredSessionMinutes: true,
                trainingEnvironment: true,
                availableEquipment: true,
                preferredTrainingStyles: true,
                preferredCardioType: true,
                averageSleepMinutes: true,
                sleepQuality: true,
                typicalStressLevel: true,
                createdAt: true,
                updatedAt: true,
              },
            },
            progressEntries: {
              select: progressEntrySelect,
              orderBy: [{ recordedAt: "desc" }, { createdAt: "desc" }],
              take: 1,
            },
          },
        },
      },
    });
  } catch {
    throw new databaseError("Database error occurred while reading the profile.");
  }
}

export async function findUserProfileByUserId(userId, db = prisma) {
  try {
    return await db.userProfile.findUnique({
      where: { userId },
      select: publicProfileSelect,
    });
  } catch {
    throw new databaseError(
      "Database error occurred while finding the public profile."
    );
  }
}

export async function upsertPublicProfile(userId, data, db = prisma) {
  try {
    return await db.userProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
      select: publicProfileSelect,
    });
  } catch {
    throw new databaseError(
      "Database error occurred while saving the public profile."
    );
  }
}

export async function updatePublicProfile(userId, data, db = prisma) {
  try {
    return await db.userProfile.update({
      where: { userId },
      data,
      select: publicProfileSelect,
    });
  } catch (error) {
    throw new databaseError(
      "Database error occurred while updating the public profile."
    );
  }
}

export async function updateAccountPreferences(userId, data, db = prisma) {
  try {
    return await db.user.update({
      where: { id: userId },
      data,
      select: {
        language: true,
        country: true,
        timezone: true,
        updatedAt: true,
      },
    });
  } catch {
    throw new databaseError(
      "Database error occurred while updating account preferences."
    );
  }
}

export async function findBodyProfileByUserId(userId, db = prisma) {
  try {
    return await db.bodyProfile.findUnique({ where: { userId } });
  } catch {
    throw new databaseError(
      "Database error occurred while finding the body profile."
    );
  }
}

export async function createBodyProfile(userId, data, db = prisma) {
  try {
    return await db.bodyProfile.create({
      data: { userId, ...data },
    });
  } catch (error) {
    if (error.code === "P2002") throw new BodyProfileAlreadyExistsError();
    throw new databaseError(
      "Database error occurred while creating the body profile."
    );
  }
}

// Onboarding is intentionally retryable, so its private body save is an upsert.
// The normal POST /me/body endpoint uses createBodyProfile and returns 409 instead.
export async function upsertBodyProfileForOnboarding(
  userId,
  data,
  db = prisma
) {
  const values = {
    birthDate: data.birthDate,
    sexForCalculation: data.sexForCalculation,
    preferredUnitSystem: data.preferredUnitSystem,
    heightCm: data.heightCm,
    startingWeightKg: data.startingWeightKg,
  };

  try {
    return await db.bodyProfile.upsert({
      where: { userId },
      create: {
        userId,
        adultConfirmedAt: new Date(),
        ...values,
      },
      update: values,
    });
  } catch {
    throw new databaseError(
      "Database error occurred while saving the body profile."
    );
  }
}

export async function updateBodyProfile(userId, data, db = prisma) {
  try {
    return await db.bodyProfile.update({
      where: { userId },
      data,
    });
  } catch (error) {
    if (error.code === "P2025") throw new BodyProfileNotFoundError();
    throw new databaseError(
      "Database error occurred while updating the body profile."
    );
  }
}

export async function updateBodyActivityLevel(
  userId,
  activityLevel,
  db = prisma
) {
  return updateBodyProfile(userId, { activityLevel }, db);
}

function bodyOwnedUpsert(modelName, userId, data, db) {
  return db[modelName].upsert({
    where: { bodyProfileId: userId },
    create: { bodyProfileId: userId, ...data },
    update: data,
  });
}

export async function upsertHealthProfile(userId, data, db = prisma) {
  try {
    return await bodyOwnedUpsert("healthProfile", userId, data, db);
  } catch (error) {
    if (error.code === "P2003") throw new BodyProfileNotFoundError();
    throw new databaseError(
      "Database error occurred while saving the health profile."
    );
  }
}

export async function upsertNutritionProfile(userId, data, db = prisma) {
  try {
    return await bodyOwnedUpsert("nutritionProfile", userId, data, db);
  } catch (error) {
    if (error.code === "P2003") throw new BodyProfileNotFoundError();
    throw new databaseError(
      "Database error occurred while saving the nutrition profile."
    );
  }
}

export async function upsertTrainingProfile(userId, data, db = prisma) {
  try {
    return await bodyOwnedUpsert("trainingProfile", userId, data, db);
  } catch (error) {
    if (error.code === "P2003") throw new BodyProfileNotFoundError();
    throw new databaseError(
      "Database error occurred while saving the training profile."
    );
  }
}

export async function upsertCoachingPreferences(userId, data, db = prisma) {
  try {
    return await db.coachingPreferences.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  } catch {
    throw new databaseError(
      "Database error occurred while saving coaching preferences."
    );
  }
}

export async function createProgressEntry(userId, data, db = prisma) {
  const { measurements, ...entry } = data;
  try {
    return await db.progressEntry.create({
      data: {
        bodyProfileId: userId,
        ...entry,
        measurements:
          measurements.length > 0
            ? { create: measurements }
            : undefined,
      },
      select: progressEntrySelect,
    });
  } catch (error) {
    if (error.code === "P2003") throw new BodyProfileNotFoundError();
    throw new databaseError(
      "Database error occurred while creating the progress entry."
    );
  }
}

export async function findTargetInputs(userId, db = prisma) {
  try {
    const [bodyProfile, activeGoal] = await Promise.all([
      db.bodyProfile.findUnique({
        where: { userId },
        select: {
          birthDate: true,
          sexForCalculation: true,
          heightCm: true,
          activityLevel: true,
          progressEntries: {
            select: {
              weightKg: true,
              recordedAt: true,
            },
            orderBy: [{ recordedAt: "desc" }, { createdAt: "desc" }],
            take: 1,
          },
        },
      }),
      db.goal.findFirst({
        where: { userId, status: "ACTIVE" },
        select: {
          id: true,
          goalType: true,
          targetWeightKg: true,
          targetDate: true,
        },
        orderBy: { updatedAt: "desc" },
      }),
    ]);
    return { bodyProfile, activeGoal };
  } catch {
    throw new databaseError(
      "Database error occurred while reading calculation inputs."
    );
  }
}

export async function deleteBodyProfile(userId, db = prisma) {
  try {
    return await db.bodyProfile.delete({ where: { userId } });
  } catch (error) {
    if (error.code === "P2025") throw new BodyProfileNotFoundError();
    throw new databaseError(
      "Database error occurred while deleting the body profile."
    );
  }
}
