import { prisma } from "../../lib/prisma.js";
import { databaseError } from "../../middlewares/errorHandling.js";

// ============ Create or update the fitness profile ============
// a user has one profile only because userId is the primary key.
// upsert is the simple way to support both first save and going back to edit.
export async function upsertUserProfile(userId, profileData, db = prisma) {
  // the frontend names describe what the user sees, while these names match Prisma.
  const data = {
    birthYear: profileData.birthYear,
    birthMonth: profileData.birthMonth,
    birthDay: profileData.birthDay,
    sexForCalculation: profileData.sexForCalculation,
    preferredUnitSystem: profileData.preferredUnitSystem,
    heightCm: profileData.heightCm,
    startingWeightKg: profileData.currentWeightKg,
  };

  try {
    return await db.userProfile.upsert({
      where: { userId },
      // adultConfirmedAt records the first confirmation. editing the profile
      // later should not rewrite that original time, so it exists only in create.
      create: { userId, adultConfirmedAt: new Date(), ...data },
      update: data,
    });
  } catch {
    throw new databaseError(
      "Database error occurred while saving the user profile."
    );
  }
}

// ============ Find a profile by user id ============
// Prisma returns null when it does not exist. the service decides whether that
// means a new user or an invalid onboarding state.
export async function findProfileByUserId(userId, db = prisma) {
  try {
    return await db.userProfile.findUnique({ where: { userId } });
  } catch {
    throw new databaseError(
      "Database error occurred while finding the user profile."
    );
  }
}

// ============ Save activity level from step 2 ============
// step 2 has both profile and goal data, but a repository should only edit
// the table it owns. the service is gonna coordinate both repositories.
export async function updateActivityLevelByUserId(
  userId,
  activityLevel,
  db = prisma
) {
  try {
    return await db.userProfile.update({
      where: { userId },
      data: { activityLevel },
    });
  } catch {
    throw new databaseError(
      "Database error occurred while updating the user profile."
    );
  }
}
