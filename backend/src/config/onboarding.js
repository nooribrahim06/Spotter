// this file is the one source of truth for values shared with the frontend.
// when we add a new option later, update the Prisma enum and this list together.
export const SEX_OPTIONS = [
  "MALE",
  "FEMALE",
];

export const UNIT_OPTIONS = [
  "METRIC",
  "IMPERIAL",
];

export const GOAL_OPTIONS = [
  "LOSE_WEIGHT",
  "MAINTAIN_WEIGHT",
  "GAIN_WEIGHT",
  "BUILD_MUSCLE",
  "IMPROVE_FITNESS",
];

export const ACTIVITY_OPTIONS = [
  "SEDENTARY",
  "LIGHTLY_ACTIVE",
  "MODERATELY_ACTIVE",
  "VERY_ACTIVE",
];

export const ONBOARDING_CONSTRAINTS = {
  minimumAge: 18,
  maximumAge: 100,
  minimumHeightCm: 100,
  maximumHeightCm: 250,
  minimumWeightKg: 30,
  maximumWeightKg: 350,
};

// GET /api/onboarding/config returns this exact object. it prevents the frontend
// from guessing allowed values or copying number limits into random components.
export const onboardingConfig = {
"goalTypes":  GOAL_OPTIONS,
    "activityLevels" : ACTIVITY_OPTIONS,
    "sexForCalculationOptions" : SEX_OPTIONS,
    "unitSystems" : UNIT_OPTIONS,
    "constraints" : ONBOARDING_CONSTRAINTS
}
