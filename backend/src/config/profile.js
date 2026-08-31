/*
 * Profile configuration has one home.
 *
 * These values are application rules, not user data, so they do not belong in
 * PostgreSQL and they should not be repeated in routes, validation, or services.
 *
 * The same constants serve two sides of the contract:
 * 1. Validation uses them to decide what the API accepts.
 * 2. GET /api/profiles/config returns them so the frontend uses the same enum
 *    values and numeric limits instead of maintaining a second copy.
 *
 * When a product rule changes, such as adding a training environment, edit this
 * file first. Prisma may still need a migration when the corresponding field is
 * a database enum, but the HTTP contract should continue to read from here.
 */

export const PROFILE_OPTIONS = {
  sexForCalculation: ["MALE", "FEMALE"],
  unitSystems: ["METRIC", "IMPERIAL"],
  activityLevels: [
    "SEDENTARY",
    "LIGHTLY_ACTIVE",
    "MODERATELY_ACTIVE",
    "VERY_ACTIVE",
  ],
  nutritionPlanStyles: [
    "EXACT_MEALS",
    "FLEXIBLE_MEALS",
    "MACRO_BASED",
    "SIMPLE_GUIDANCE",
  ],
  cookingSkills: ["NONE", "BASIC", "INTERMEDIATE", "ADVANCED"],
  kitchenAccess: ["NONE", "MICROWAVE_ONLY", "BASIC", "FULL"],
  foodBudgetLevels: ["LOW", "MODERATE", "FLEXIBLE"],
  trainingExperienceLevels: ["BEGINNER", "INTERMEDIATE", "ADVANCED"],
  trainingEnvironments: [
    "COMMERCIAL_GYM",
    "HOME_GYM",
    "HOME_MINIMAL",
    "OUTDOORS",
    "MIXED",
  ],
  coachingStyles: ["SUPPORTIVE", "BALANCED", "DIRECT"],
  explanationLevels: ["CONCISE", "NORMAL", "DETAILED"],
  motivationStyles: [
    "ENCOURAGING",
    "ACCOUNTABILITY",
    "FACT_BASED",
    "MINIMAL",
  ],
  checkinFrequencies: ["DAILY", "FEW_TIMES_PER_WEEK", "WEEKLY"],
  bodyMeasurementTypes: [
    "WAIST",
    "ABDOMEN",
    "CHEST",
    "HIPS",
    "NECK",
    "SHOULDERS",
    "LEFT_UPPER_ARM",
    "RIGHT_UPPER_ARM",
    "LEFT_FOREARM",
    "RIGHT_FOREARM",
    "LEFT_THIGH",
    "RIGHT_THIGH",
    "LEFT_CALF",
    "RIGHT_CALF",
  ],
};

export const PROFILE_CONSTRAINTS = {
  minimumAge: 18,
  maximumAge: 100,
  heightCm: { min: 100, max: 250 },
  weightKg: { min: 30, max: 350 },
  bodyFatPercentage: { min: 2, max: 75 },
  restingHeartRateBpm: { min: 30, max: 220 },
  measurementCm: { min: 10, max: 300 },
  trainingDaysPerWeek: { min: 0, max: 7 },
  sessionMinutes: { min: 5, max: 300 },
  averageSleepMinutes: { min: 0, max: 1440 },
};

// The server, not the client, decides whether plan generation needs
// professional clearance. These are kept beside the other profile rules so the
// decision is reviewable and is not buried inside a service function.
export const PROFESSIONAL_CLEARANCE_CONDITION_CODES = [
  "CHEST_PAIN",
  "HEART_DISEASE",
  "UNCONTROLLED_HYPERTENSION",
  "FAINTING_DURING_EXERCISE",
];

export const PROFESSIONAL_CLEARANCE_STATE_CODES = [
  "PREGNANT",
  "POST_SURGERY",
  "RECENT_MAJOR_INJURY",
  "DOCTOR_RESTRICTED_EXERCISE",
];

// Version-one target calculation settings. Keeping the numbers here makes it
// obvious that they are product/calculation policy and lets a later calculator
// version replace them without rewriting the profile request handlers.
export const TARGET_CALCULATION_CONFIG = {
  version: "mifflin-st-jeor-v1",
  activityFactors: {
    SEDENTARY: 1.2,
    LIGHTLY_ACTIVE: 1.375,
    MODERATELY_ACTIVE: 1.55,
    VERY_ACTIVE: 1.725,
  },
  calorieAdjustments: {
    LOSE_WEIGHT: -500,
    MAINTAIN_WEIGHT: 0,
    GAIN_WEIGHT: 300,
    BUILD_MUSCLE: 250,
    IMPROVE_FITNESS: 0,
  },
  minimumCalories: {
    MALE: 1500,
    FEMALE: 1200,
  },
};

// Only this public subset is returned by GET /api/profiles/config. Internal
// calculation multipliers remain server-owned even though they live nearby.
export const profileConfig = {
  ...PROFILE_OPTIONS,
  constraints: PROFILE_CONSTRAINTS,
};
