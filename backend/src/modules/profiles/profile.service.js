import bcrypt from "bcryptjs";

import {
  PROFESSIONAL_CLEARANCE_CONDITION_CODES,
  PROFESSIONAL_CLEARANCE_STATE_CODES,
  TARGET_CALCULATION_CONFIG,
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
import {
  serializeBodyProfile,
  serializeBodyProfileUpdate,
  serializeCompleteProfile,
  serializeDateOnly,
  serializeDecimal,
  serializeOwnedProfileSection,
  serializeProgressEntry,
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
      ? { birthDate: new Date(`${data.birthDate}T00:00:00.000Z`) }
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

export async function addMyProgressEntry(userId, data) {
  await requireBodyProfile(userId);
  const saved = await profileRepository.createProgressEntry(userId, data);
  return serializeProgressEntry(saved);
}

// Age is calculated from birthDate every time because storing age would become
// incorrect on the user's next birthday.
function ageOnDate(birthDate, today = new Date()) {
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const birthdayHasPassed =
    today.getUTCMonth() > birthDate.getUTCMonth() ||
    (today.getUTCMonth() === birthDate.getUTCMonth() &&
      today.getUTCDate() >= birthDate.getUTCDate());
  if (!birthdayHasPassed) age -= 1;
  return age;
}

export async function getMyTargets(userId) {
  const { bodyProfile, activeGoal } =
    await profileRepository.findTargetInputs(userId);

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

  const weightKg = serializeDecimal(latestProgress.weightKg);
  const heightCm = serializeDecimal(bodyProfile.heightCm);
  const age = ageOnDate(bodyProfile.birthDate);
  const sexAdjustment =
    bodyProfile.sexForCalculation === "MALE" ? 5 : -161;

  // Mifflin-St Jeor provides the deterministic MVP baseline. The formula lives
  // here because this is business calculation, while its adjustable policy
  // values live in config/profile.js.
  const bmr =
    10 * weightKg + 6.25 * heightCm - 5 * age + sexAdjustment;
  const estimatedMaintenance =
    bmr *
    TARGET_CALCULATION_CONFIG.activityFactors[bodyProfile.activityLevel];
  const minimumCalories =
    TARGET_CALCULATION_CONFIG.minimumCalories[
      bodyProfile.sexForCalculation
    ];
  const dailyCalories = Math.round(
    Math.max(
      minimumCalories,
      estimatedMaintenance +
        TARGET_CALCULATION_CONFIG.calorieAdjustments[activeGoal.goalType]
    )
  );

  const proteinMultiplier = [
    "LOSE_WEIGHT",
    "GAIN_WEIGHT",
    "BUILD_MUSCLE",
  ].includes(activeGoal.goalType)
    ? 1.8
    : 1.6;
  const proteinGrams = Math.round(weightKg * proteinMultiplier);
  const fatGrams = Math.round((dailyCalories * 0.25) / 9);
  const carbohydrateGrams = Math.max(
    0,
    Math.round((dailyCalories - proteinGrams * 4 - fatGrams * 9) / 4)
  );

  return {
    dailyCalories,
    proteinGrams,
    carbohydrateGrams,
    fatGrams,
    calculatorVersion: TARGET_CALCULATION_CONFIG.version,
    basedOn: {
      goalId: activeGoal.id,
      goalType: activeGoal.goalType,
      targetWeightKg: serializeDecimal(activeGoal.targetWeightKg),
      targetDate: serializeDateOnly(activeGoal.targetDate),
      weightKg,
      weightRecordedAt: latestProgress.recordedAt,
    },
    disclaimer:
      "These targets are estimates for fitness planning and are not medical advice.",
  };
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
