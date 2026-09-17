import { EXERCISE_OPTIONS } from "../../config/exercise.js";
import { PROFILE_OPTIONS } from "../../config/profile.js";
import { CONCRETE_MEAL_PLAN_STYLES } from "../../config/plan.js";

// Shared by GET /context and the tool session used by POST /generate.
// Professional clearance is the only health eligibility block. Other health
// and food restrictions remain planning inputs, not automatic disqualifiers.
export function evaluatePlanReadiness(context) {
  const missingRequired = [];
  const missingOptional = [];
  const issues = [];

  const {
    user,
    bodyProfile,
    latestProgress,
    goal,
    healthProfile,
    nutritionProfile,
    trainingProfile,
  } = context;

  // -------------------------
  // User
  // -------------------------

  if (!user?.timezone) {
    missingRequired.push("TIMEZONE");
  }

  // -------------------------
  // Goal
  // -------------------------

  if (!goal) {
    missingRequired.push("ACTIVE_GOAL");
  }

  if (
    goal &&
    ["LOSE_WEIGHT", "GAIN_WEIGHT"].includes(goal.goalType) &&
    !goal.targetWeightKg
  ) {
    missingRequired.push("TARGET_WEIGHT");
  }

  // -------------------------
  // Body
  // -------------------------

  if (!bodyProfile) {
    missingRequired.push("BODY_PROFILE");
  } else {
    if (!bodyProfile.birthDate)
      missingRequired.push("BIRTH_DATE");

    if (!bodyProfile.sexForCalculation)
      missingRequired.push("SEX_FOR_CALCULATION");

    if (!bodyProfile.heightCm)
      missingRequired.push("HEIGHT");

    if (!bodyProfile.activityLevel)
      missingRequired.push("ACTIVITY_LEVEL");

    // Match the existing target calculator: current weight comes from a
    // recorded progress entry, never an undated starting-weight fallback.
    if (latestProgress?.weightKg == null)
      missingRequired.push("CURRENT_WEIGHT");
  }

  // -------------------------
  // Health / safety
  // -------------------------

  if (!healthProfile) {
    missingRequired.push("HEALTH_PROFILE");
  } else {
    if (healthProfile.healthConditions === null)
      missingRequired.push("HEALTH_CONDITIONS");

    if (healthProfile.movementLimitations === null)
      missingRequired.push("MOVEMENT_LIMITATIONS");

    if (healthProfile.specialPlanningStates === null)
      missingRequired.push("SPECIAL_PLANNING_STATES");

    if (healthProfile.requiresProfessionalClearance) {
      return {
        ready: false,
        blocked: true,
        blockReason: "PROFESSIONAL_CLEARANCE_REQUIRED",
        missingRequired,
        missingOptional,
        issues,
      };
    }
  }

  // -------------------------
  // Training
  // -------------------------

  if (!trainingProfile) {
    missingRequired.push("TRAINING_PROFILE");
  } else {
    if (!trainingProfile.overallExperienceLevel)
      missingRequired.push("TRAINING_EXPERIENCE");

    if (!trainingProfile.trainingDaysPerWeek)
      missingRequired.push("TRAINING_DAYS_PER_WEEK");

    // Entries include unavailable weekdays, so array length is not capacity.
    const availableDays = Array.isArray(trainingProfile.availableDays)
      ? trainingProfile.availableDays.filter((day) => day.available === true)
      : [];

    if (availableDays.length === 0)
      missingRequired.push("AVAILABLE_TRAINING_DAYS");

    if (!trainingProfile.preferredSessionMinutes)
      missingRequired.push("SESSION_DURATION");

    if (!trainingProfile.trainingEnvironment)
      missingRequired.push("TRAINING_ENVIRONMENT");

    if (
      trainingProfile.trainingDaysPerWeek != null &&
      trainingProfile.trainingDaysPerWeek > availableDays.length
    ) {
      issues.push("TRAINING_DAYS_EXCEED_AVAILABILITY");
    }
  }

  // -------------------------
  // Nutrition
  // -------------------------

  if (!nutritionProfile) {
    missingRequired.push("NUTRITION_PROFILE");
  } else {
    if (nutritionProfile.dietaryPreferenceCodes === null)
      missingRequired.push("DIETARY_PREFERENCES");

    if (nutritionProfile.foodAllergies === null)
      missingRequired.push("FOOD_ALLERGIES");

    if (nutritionProfile.foodIntolerances === null)
      missingRequired.push("FOOD_INTOLERANCES");

    if (!nutritionProfile.planStyle)
      missingRequired.push("NUTRITION_PLAN_STYLE");

    if (nutritionProfile.planStyle &&
        !PROFILE_OPTIONS.nutritionPlanStyles.includes(nutritionProfile.planStyle)) {
      issues.push("UNSUPPORTED_NUTRITION_PLAN_STYLE");
    }

    // These are representation limits, not health eligibility decisions.
    // Keep them here so context and generation report the same prerequisites.
    if (CONCRETE_MEAL_PLAN_STYLES.includes(nutritionProfile.planStyle)) {
      if (nutritionProfile.mealsPerDay == null) {
        missingRequired.push("MEALS_PER_DAY");
      } else if (nutritionProfile.mealsPerDay !== 3) {
        issues.push("UNSUPPORTED_MAIN_MEAL_COUNT");
      }
      if (nutritionProfile.snacksPerDay == null) {
        missingRequired.push("SNACKS_PER_DAY");
      } else if (![0, 1].includes(nutritionProfile.snacksPerDay)) {
        issues.push("UNSUPPORTED_SNACK_COUNT");
      }
    }

    if (nutritionProfile.foodPreferences === null)
      missingOptional.push("FOOD_PREFERENCES");

    if (!nutritionProfile.cookingSkill)
      missingOptional.push("COOKING_SKILL");

    if (!nutritionProfile.foodBudgetLevel)
      missingOptional.push("FOOD_BUDGET");
  }

  return {
    ready:
      missingRequired.length === 0 &&
      issues.length === 0,

    blocked: false,

    missingRequired,
    missingOptional,
    issues,
  };
}

// One equipment policy, shared by search filtering and final selection checks.
// BODY_WEIGHT is a catalog code, not proof that no apparatus is required.
export function getAllowedPlanEquipment(trainingProfile) {
  return [...new Set([
    "BODY_WEIGHT",
    ...(trainingProfile.availableEquipment ?? [])
      .map((item) => item.code)
      .filter((code) => EXERCISE_OPTIONS.equipment.includes(code)),
  ])];
}
