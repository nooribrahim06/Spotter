import bcrypt from "bcryptjs";

import {
  PROFESSIONAL_CLEARANCE_CONDITION_CODES,
  PROFESSIONAL_CLEARANCE_STATE_CODES,
  profileConfig,
} from "../../config/profile.js";
import { prisma } from "../../lib/prisma.js";
import {
  ActiveGoalRequiredError,
  BodyProfileAlreadyExistsError,
  BodyProfileNotFoundError,
  InvalidAccessTokenError,
  InvalidActionConfirmationError,
  ProfileIncompleteError,
} from "../../middlewares/errorHandling.js";
import { findUserPasswordHashById } from "../users/user.repository.js";
import * as profileRepository from "./profile.repository.js";
import { calculateFitnessTargets } from "./profile.targets.js";
import {
  serializeBodyProfile,
  serializeBodyProfileUpdate,
  serializeCompleteProfile,
  serializeOwnedProfileSection,
  serializePublicProfile,
} from "./profile.serializer.js";

// Configuration is application data, not database data. Returning the imported
// object keeps the route/controller simple and guarantees validation and the
// frontend receive values from the same file.
export function getProfileConfig() {
  return profileConfig;
}

export async function getMyProfile(userId) {
  const profile = await profileRepository.findCompleteProfileByUserId(userId);
  if (!profile) throw new InvalidAccessTokenError();
  return serializeCompleteProfile(profile);
}

export async function updateMyPublicProfile(userId, data) {
  const existing =
    await profileRepository.findUserProfileByUserId(userId);

  // Onboarding normally creates UserProfile. Supporting creation here makes the
  // action safe after imported/legacy data, but both required names must exist
  // when there is no row to patch yet.
  if (!existing && (!data.firstName || !data.lastName)) {
    const details = [];
    if (!data.firstName) {
      details.push({
        field: "firstName",
        message: "First name is required when creating the public profile.",
      });
    }
    if (!data.lastName) {
      details.push({
        field: "lastName",
        message: "Last name is required when creating the public profile.",
      });
    }
    throw new ProfileIncompleteError(details);
  }
  // why we separate updat and upsert?
  /**
   * upsert 
     Missing profile is normal → create it with upsert --> this is the behavior we want for onboarding and imported/legacy data.

update: 
Missing profile is unexpected → fail instead of silently creating it --> to avoid accidentally creating a new profile when the user intended to update an existing one. 
This helps maintain data integrity and prevents unintended consequences.
   */
  const saved = existing
    ? await profileRepository.updatePublicProfile(userId, data)
    : await profileRepository.upsertPublicProfile(userId, data);
  return serializePublicProfile(saved);
}

export async function updateMyAccountPreferences(userId, data) {
  return profileRepository.updateAccountPreferences(userId, data);
}

export async function createMyBodyProfile(userId, data) {
  const existing = await profileRepository.findBodyProfileByUserId(userId);
  if (existing) throw new BodyProfileAlreadyExistsError();

  // adultConfirmed is a one-time request assertion. The database stores when it
  // was accepted rather than storing the submitted true value.
  const { adultConfirmed, birthDate, startingWeightKg, ...bodyData } = data;
  const databaseBirthDate = new Date(`${birthDate}T00:00:00.000Z`);

  // BodyProfile and its first weight are one logical creation. A transaction
  // prevents a profile with no starting progress or an orphaned progress entry.
  await prisma.$transaction(async (tx) => {
    await profileRepository.createBodyProfile(
      userId,
      {
        ...bodyData,
        birthDate: databaseBirthDate,
        startingWeightKg,
        adultConfirmedAt: new Date(),
      },
      tx
    );
    await profileRepository.createProgressEntry(
      userId,
      {
        weightKg: startingWeightKg,
        measurements: [],
        isInitialForGoal: null,
      },
      tx
    );
  });

  const complete = await profileRepository.findCompleteProfileByUserId(userId);
  return serializeBodyProfile(complete.bodyProfile);
}

export async function updateMyBodyProfile(userId, data) {
  // Validation makes startingWeightKg and adultConfirmedAt impossible to send.
  // Only birthDate needs an API-string to database-Date conversion here.
  const values = {
    ...data,
    ...(data.birthDate
      ? { birthDate: new Date(`${data.birthDate}T00:00:00.000Z`) } // HELPS   to convert the date string to a Date object in UTC format, 
      // ensuring consistency in how dates are stored and compared in the database.

      // The "T00:00:00.000Z" T for separating date and time 
      // 00:00:00 for midnight, and Z for UTC timezone.
      : {}),
  };
  const saved = await profileRepository.updateBodyProfile(userId, values);
  return serializeBodyProfileUpdate(saved);
}

const clearanceConditionCodes = new Set(
  PROFESSIONAL_CLEARANCE_CONDITION_CODES
);
const clearanceStateCodes = new Set(PROFESSIONAL_CLEARANCE_STATE_CODES);

// The frontend is never trusted to choose its own safety result. For MVP the
// result is deterministic and reviewable. A future medical-safety subsystem may
// replace this rule, but an LLM should not silently make this high-impact flag.

// my model can set this flag to true if the user has any health conditions or special planning states that require professional clearance.
function requiresProfessionalClearance(data) {
  const riskyCondition = data.healthConditions.some(
    (condition) =>
      condition.active && clearanceConditionCodes.has(condition.code)
  );
  const riskyState = data.specialPlanningStates.some((state) =>
    clearanceStateCodes.has(state.code)
  );
  return riskyCondition || riskyState;
}

// Health, nutrition, training, and progress are children of BodyProfile. Since
// users may delete that parent, every child write explicitly verifies it exists
// and returns one meaningful 404 instead of a raw foreign-key database error.
async function requireBodyProfile(userId) {
  const bodyProfile =
    await profileRepository.findBodyProfileByUserId(userId);
  if (!bodyProfile) throw new BodyProfileNotFoundError();
  return bodyProfile;
}

export async function replaceMyHealthProfile(userId, data) {
  await requireBodyProfile(userId);
  const saved = await profileRepository.upsertHealthProfile(userId, {
    ...data,
    // This flag is used to determine if the user needs professional clearance.
    requiresProfessionalClearance: requiresProfessionalClearance(data),
  });
  return serializeOwnedProfileSection(saved);
}

export async function replaceMyNutritionProfile(userId, data) {
  await requireBodyProfile(userId);
  const saved = await profileRepository.upsertNutritionProfile(userId, data);
  return serializeOwnedProfileSection(saved);
}

export async function replaceMyTrainingProfile(userId, data) {
  await requireBodyProfile(userId);
  const saved = await profileRepository.upsertTrainingProfile(userId, data);
  return serializeOwnedProfileSection(saved);
}

export async function replaceMyCoachingPreferences(userId, data) {
  const saved =
    await profileRepository.upsertCoachingPreferences(userId, data);
  return serializeOwnedProfileSection(saved);
}

export async function getMyTargets(userId, db) {
  const { bodyProfile, activeGoal } =
    await profileRepository.findTargetInputs(userId, db);

  if (!bodyProfile) throw new BodyProfileNotFoundError();
  if (!activeGoal) throw new ActiveGoalRequiredError();

  const latestProgress = bodyProfile.progressEntries[0];
  const missing = [];
  if (!bodyProfile.activityLevel) missing.push("activityLevel");
  if (!latestProgress) missing.push("currentWeightKg");

  if (missing.length > 0) {
    throw new ProfileIncompleteError(
      missing.map((field) => ({
        field,
        message: "This value is required to calculate targets.",
      }))
    );
  }

  return calculateFitnessTargets({
    bodyProfile,
    goal: activeGoal,
    progressEntry: latestProgress,
  });
}

export async function deleteMyBodyProfile(userId, password) {
  // Deleting the private fitness identity is destructive, so possession of a
  // valid access token alone is not enough. The current password is checked
  // immediately before the transaction.
  const credentials = await findUserPasswordHashById(userId);
  if (!credentials) throw new InvalidAccessTokenError();

  const passwordMatches = await bcrypt.compare(
    password,
    credentials.passwordHash
  );
  if (!passwordMatches) throw new InvalidActionConfirmationError();

  await prisma.$transaction(async (tx) => {
    // The database cascade removes health, nutrition, training, progress, and
    // measurements. The same transaction cancels unusable goals and reopens
    // onboarding, while public identity and coaching preferences are preserved.
    await profileRepository.deleteBodyProfile(userId, tx);
    await tx.goal.updateMany({
      where: {
        userId,
        status: { in: ["DRAFT", "ACTIVE"] },
      },
      data: { status: "CANCELLED" },
    });
    await tx.user.update({
      where: { id: userId },
      data: {
        onboardingStatus: "NOT_STARTED",
        onboardingStep: 1,
        fitnessOnboardingCompletedAt: null,
      },
    });
  });
}
