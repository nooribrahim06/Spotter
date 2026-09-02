import { onboardingConfig } from "../../config/onboarding.js";
import { prisma } from "../../lib/prisma.js";
import {
  InvalidOnboardingStateError,
  OnboardingIncompleteError,
} from "../../middlewares/errorHandling.js";
import {
  activateGoal,
  findOnboardingGoalByUserId,
  upsertOnboardingGoal,
} from "../goals/goal.repository.js";
import { assertGoalTargetDirection } from "../goals/goal.rules.js";
import {
  findBodyProfileByUserId,
  findUserProfileByUserId,
  updateBodyActivityLevel,
  upsertBodyProfileForOnboarding,
  upsertPublicProfile,
} from "../profiles/profile.repository.js";
import { createInitialProgressEntry } from "../progress/progress.repository.js";
import {
  claimOnboardingCompletion,
  findUserById,
  updateUserOnboardingStatus,
} from "../users/user.repository.js";

// prisma enums are uppercase, but the frontend contract uses lowercase status
// names like "not_started" and "in_progress". we convert only at the API edge.
function publicStatus(status) {
  return status.toLowerCase();
}

// this is gonna tell the frontend which progress circles should look completed.
// step 3 means the review screen itself has also been finished.
function completedSteps(user) {
  if (user.onboardingStatus === "COMPLETED") return [1, 2, 3];
  if ((user.onboardingStep ?? 1) >= 3) return [1, 2];
  if ((user.onboardingStep ?? 1) >= 2) return [1];
  return [];
}

// a Prisma Date becomes a full timestamp in JSON by default. the frontend only
// asked for a calendar date, so we return YYYY-MM-DD and avoid timezone confusion.
function dateOnly(date) {
  return date ? date.toISOString().slice(0, 10) : null;
}

// database names and frontend names are not always the same:
// startingWeightKg -> currentWeightKg, and Decimal -> normal JavaScript number.
// the goal is a separate table, so we combine it with the profile in this response.
function savedData(publicProfile, bodyProfile, goal) {
  if (!publicProfile || !bodyProfile) return {};

  return {
    firstName: publicProfile.firstName,
    lastName: publicProfile.lastName,
    birthYear: bodyProfile.birthDate.getUTCFullYear(),
    birthMonth: bodyProfile.birthDate.getUTCMonth() + 1,
    birthDay: bodyProfile.birthDate.getUTCDate(),
    adultConfirmed: Boolean(bodyProfile.adultConfirmedAt),
    sexForCalculation: bodyProfile.sexForCalculation,
    preferredUnitSystem: bodyProfile.preferredUnitSystem,
    heightCm: Number(bodyProfile.heightCm),
    currentWeightKg: Number(bodyProfile.startingWeightKg),
    activityLevel: bodyProfile.activityLevel ?? null,
    goalType: goal?.goalType ?? null,
    targetWeightKg:
      goal?.targetWeightKg == null ? null : Number(goal.targetWeightKg),
    targetDate: dateOnly(goal?.targetDate),
  };
}

// all save and complete responses share the same progress shape. keeping it in
// one helper stops step 1, step 2, and step 3 from slowly returning different data.
function progressResponse(user, message = null) {
  const response = {
    status: publicStatus(user.onboardingStatus),
    currentStep:
      user.onboardingStatus === "COMPLETED" ? null : user.onboardingStep,
    completedSteps: completedSteps(user),
  };

  if (message) response.message = message;
  return response;
}

// this config does not come from the database because it is application rules,
// not user data. the frontend uses it to build selects and input limits.
export function getOnboardingConfig() {
  return onboardingConfig;
}

// this function is gonna respond with saved onboarding data for a returning user.
// profile and goal are independent reads, so outside a transaction they may run together.
// expected response when there is no saved profile:
// {
//   status: "not_started",
//   currentStep: 1,
//   completedSteps: [],
//   data: {}
// }
//
// OR when the user already saved something:
// {
//   status: "in_progress",
//   currentStep: 2,
//   completedSteps: [1],
//   data: { birthYear, birthMonth, birthDay, currentWeightKg, ... }
// }
export async function getUserOnboarding(userId) {
  const [user, publicProfile, bodyProfile, goal] = await Promise.all([
    findUserById(userId),
    findUserProfileByUserId(userId),
    findBodyProfileByUserId(userId),
    findOnboardingGoalByUserId(userId),
  ]);

  if (!user) {
    throw new InvalidOnboardingStateError("The authenticated user no longer exists.");
  }

  // expected new-user response:
  // { status: "not_started", currentStep: 1, completedSteps: [], data: {} }
  // returning users receive the same shape with their saved fields inside data.
  return {
    ...progressResponse(user),
    data: savedData(publicProfile, bodyProfile, goal),
  };
}

// ==================== Save Step 1 ====================
// upsert means create the profile the first time and update the same profile
// when the user goes back. we should not create a second profile or reject edits.
// expected response after the first save:
// {
//   message: "Onboarding progress saved.",
//   status: "in_progress",
//   currentStep: 2,
//   completedSteps: [1]
// }
async function saveStep1(userId, data) {
  const user = await findUserById(userId);
  if (!user || user.onboardingStatus === "COMPLETED") {
    throw new InvalidOnboardingStateError(
      "Completed onboarding cannot be changed through this endpoint."
    );
  }

  const nextStep = Math.max(user.onboardingStep ?? 1, 2);

  // profile and user progress must succeed together. if one query fails,
  // Prisma is gonna roll back both changes and we do not leave half-saved data.
  await prisma.$transaction(async (tx) => {
    await upsertPublicProfile(
      userId,
      { firstName: data.firstName, lastName: data.lastName },
      tx
    );
    await upsertBodyProfileForOnboarding(
      userId,
      {
        birthDate: new Date(
          Date.UTC(data.birthYear, data.birthMonth - 1, data.birthDay)
        ),
        sexForCalculation: data.sexForCalculation,
        preferredUnitSystem: data.preferredUnitSystem,
        heightCm: data.heightCm,
        startingWeightKg: data.currentWeightKg,
      },
      tx
    );
    await updateUserOnboardingStatus(userId, "IN_PROGRESS", nextStep, tx);
  });

  return progressResponse(
    { onboardingStatus: "IN_PROGRESS", onboardingStep: nextStep },
    "Onboarding progress saved."
  );
}

// ==================== Save Step 2 ====================
// we can not trust the requested step alone. the database must prove that
// step 1 exists before activity level and goal data may be saved.
// expected response after this save:
// {
//   message: "Onboarding progress saved.",
//   status: "in_progress",
//   currentStep: 3,
//   completedSteps: [1, 2]
// }
async function saveStep2(userId, data) {
  const [user, bodyProfile] = await Promise.all([
    findUserById(userId),
    findBodyProfileByUserId(userId),
  ]);

  if (!user || user.onboardingStatus === "COMPLETED") {
    throw new InvalidOnboardingStateError(
      "Completed onboarding cannot be changed through this endpoint."
    );
  }

  if (!bodyProfile || (user.onboardingStep ?? 1) < 2) {
    throw new InvalidOnboardingStateError(
      "Complete onboarding step 1 before saving step 2."
    );
  }

  // undefined and null both become database null. this lets the user remove an
  // optional target he saved earlier instead of accidentally keeping stale data.
  const goalData = {
    goalType: data.goalType,
    targetWeightKg: data.targetWeightKg ?? null,
    targetDate: data.targetDate
      ? new Date(`${data.targetDate}T00:00:00.000Z`)
      : null,
  };

  assertGoalTargetDirection({
    goalType: goalData.goalType,
    targetWeightKg: goalData.targetWeightKg,
    currentWeightKg: bodyProfile.startingWeightKg,
  });

  // activity belongs to BodyProfile, while the current goal belongs to Goal.
  // the transaction keeps those two tables and the user step in sync.
  await prisma.$transaction(async (tx) => {
    await updateBodyActivityLevel(userId, data.activityLevel, tx);
    await upsertOnboardingGoal(userId, goalData, tx);
    await updateUserOnboardingStatus(userId, "IN_PROGRESS", 3, tx);
  });

  return progressResponse(
    { onboardingStatus: "IN_PROGRESS", onboardingStep: 3 },
    "Onboarding progress saved."
  );
}

// the controller does not build dynamic function names anymore. an explicit
// choice is easier to read and makes it impossible to call an unexpected service.
export async function saveOnboardingStep(userId, step, data) {
  if (step === 1) return saveStep1(userId, data);
  if (step === 2) return saveStep2(userId, data);
  throw new InvalidOnboardingStateError("Only onboarding steps 1 and 2 can be saved.");
}

// before step 3 completes, collect safe public details about anything missing.
// these field names are enough for the frontend without leaking database details.
function incompleteDetails(publicProfile, bodyProfile, goal) {
  const details = [];

  if (!publicProfile || !bodyProfile) {
    details.push({ field: "step", message: "Onboarding step 1 is missing." });
  } else if (!bodyProfile.activityLevel) {
    details.push({
      field: "activityLevel",
      message: "Activity level has not been saved.",
    });
  }

  if (!goal || goal.status !== "DRAFT") {
    details.push({ field: "goalType", message: "A saved goal is required." });
  }

  return details;
}

// ==================== Complete Step 3 ====================
// step 3 does not receive fitness data. it confirms the two saved steps,
// creates the starting progress point, activates the goal, and closes onboarding.
// expected response:
// {
//   message: "Onboarding completed.",
//   status: "completed",
//   currentStep: null,
//   completedSteps: [1, 2, 3]
// }
export async function completeOnboarding(userId) {
  const existingUser = await findUserById(userId);

  if (!existingUser) {
    throw new InvalidOnboardingStateError("The authenticated user no longer exists.");
  }

  if (existingUser.onboardingStatus === "COMPLETED") {
    // completion is idempotent: refreshing the success page is not an error.
    return progressResponse(existingUser, "Onboarding is already complete.");
  }

  const transactionResult = await prisma.$transaction(async (tx) => {
    // A transaction uses one database connection, so keep its queries sequential.
    const user = await findUserById(userId, tx);
    const publicProfile = await findUserProfileByUserId(userId, tx);
    const bodyProfile = await findBodyProfileByUserId(userId, tx);
    const goal = await findOnboardingGoalByUserId(userId, tx);

    if (user.onboardingStatus === "COMPLETED") return "already_completed";

    if (user.onboardingStep !== 3) {
      throw new InvalidOnboardingStateError(
        "Complete onboarding steps 1 and 2 before finishing."
      );
    }

    const details = incompleteDetails(publicProfile, bodyProfile, goal);
    if (details.length > 0) throw new OnboardingIncompleteError(details);

    // Step 1 can be edited after step 2, so compare again before activation.
    assertGoalTargetDirection({
      goalType: goal.goalType,
      targetWeightKg: goal.targetWeightKg,
      currentWeightKg: bodyProfile.startingWeightKg,
    });

    const completedAt = new Date();

    // this update is also our concurrency lock. only one request can change the
    // user from step 3 to completed; a second request safely gets count 0.
    const claim = await claimOnboardingCompletion(userId, completedAt, tx);
    if (claim.count !== 1) return "already_completed";

    await createInitialProgressEntry(
      {
        bodyProfileId: userId,
        goalId: goal.id,
        weightKg: bodyProfile.startingWeightKg,
      },
      tx
    );

    // sending the email was not atomic in auth, but everything here really is:
    // user completion, initial progress, and goal activation share one transaction.
    await activateGoal(goal.id, userId, tx);

    return "completed";
  });

  const message =
    transactionResult === "completed"
      ? "Onboarding completed."
      : "Onboarding is already complete.";

  return progressResponse(
    { onboardingStatus: "COMPLETED", onboardingStep: null },
    message
  );
}
