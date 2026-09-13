import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createBodyProfileSchema,
  healthProfileSchema,
  publicProfileUpdateSchema,
  trainingProfileSchema,
  updateBodyProfileSchema,
} from "../src/modules/profiles/profile.validation.js";

test("body creation accepts the complete canonical input", () => {
  const result = createBodyProfileSchema.safeParse({
    birthDate: "2000-06-15",
    adultConfirmed: true,
    sexForCalculation: "MALE",
    preferredUnitSystem: "METRIC",
    heightCm: 178,
    startingWeightKg: 82.5,
    activityLevel: "MODERATELY_ACTIVE",
  });

  assert.equal(result.success, true);
});

test("body updates cannot overwrite baseline or current weight", () => {
  const baselineResult = updateBodyProfileSchema.safeParse({
    startingWeightKg: 90,
  });
  const currentResult = updateBodyProfileSchema.safeParse({
    currentWeightKg: 90,
  });

  assert.equal(baselineResult.success, false);
  assert.equal(currentResult.success, false);
});

test("public profile updates reject internal and account fields", () => {
  const result = publicProfileUpdateSchema.safeParse({
    firstName: "Nour",
    role: "ADMIN",
    profilePhotoKey: "private/key.webp",
  });

  assert.equal(result.success, false);
});

test("health input cannot choose its own clearance result", () => {
  const result = healthProfileSchema.safeParse({
    healthConditions: [],
    movementLimitations: [],
    specialPlanningStates: [],
    safetyNotes: null,
    requiresProfessionalClearance: false,
  });

  assert.equal(result.success, false);
});

test("training days cannot exceed days marked available", () => {
  const result = trainingProfileSchema.safeParse({
    overallExperienceLevel: "BEGINNER",
    resistanceTrainingLevel: "BEGINNER",
    cardioTrainingLevel: "BEGINNER",
    currentlyTrainingConsistently: false,
    trainingDaysPerWeek: 3,
    availableDays: [
      { day: 1, available: true },
      { day: 2, available: false },
    ],
    preferredSessionMinutes: 45,
    trainingEnvironment: "COMMERCIAL_GYM",
    availableEquipment: [],
    preferredTrainingStyles: [],
    preferredCardioType: null,
    averageSleepMinutes: 480,
    sleepQuality: 7,
    typicalStressLevel: 4,
  });

  assert.equal(result.success, false);
  assert.ok(
    result.error.issues.some(
      (issue) => issue.path.join(".") === "trainingDaysPerWeek"
    )
  );
});
