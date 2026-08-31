import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";

const { prisma } = await import("../src/lib/prisma.js");
const { app } = await import("../src/app.js");
const { createAccessToken } = await import(
  "../src/modules/auth/auth.tokens.js"
);

const password = "StrongPass123!";
let user;
let server;
let baseUrl;
let accessToken;

before(async () => {
  const unique = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  user = await prisma.user.create({
    data: {
      email: `profiles_${unique}@example.com`,
      username: `profiles_${unique}`.slice(0, 30),
      passwordHash: await bcrypt.hash(password, 10),
      emailVerified: true,
    },
  });

  const session = await prisma.authSession.create({
    data: {
      userId: user.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  accessToken = createAccessToken({ userId: user.id, sessionId: session.id });

  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  if (user) {
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
  await prisma.$disconnect();
});

async function request(path, { method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  return {
    response,
    body: response.status === 204 ? null : await response.json(),
  };
}

async function completeMinimumOnboarding() {
  await request("/api/onboarding", {
    method: "PATCH",
    body: {
      step: 1,
      data: {
        firstName: "Nour",
        lastName: "Ibrahim",
        birthYear: 2000,
        birthMonth: 6,
        birthDay: 15,
        adultConfirmed: true,
        sexForCalculation: "MALE",
        preferredUnitSystem: "METRIC",
        heightCm: 178,
        currentWeightKg: 82.5,
      },
    },
  });
  await request("/api/onboarding", {
    method: "PATCH",
    body: {
      step: 2,
      data: {
        goalType: "IMPROVE_FITNESS",
        activityLevel: "MODERATELY_ACTIVE",
      },
    },
  });
  await request("/api/onboarding/complete", { method: "POST" });
}

test("profile sections, progress, targets, and body deletion work together", async () => {
  await completeMinimumOnboarding();

  const publicUpdate = await request("/api/profiles/me/public", {
    method: "PATCH",
    body: {
      displayName: "Nour",
      bio: "Building healthier habits.",
    },
  });
  assert.equal(publicUpdate.response.status, 200);
  assert.equal(publicUpdate.body.data.displayName, "Nour");
  assert.equal("profilePhotoKey" in publicUpdate.body.data, false);

  const accountUpdate = await request(
    "/api/profiles/me/account-preferences",
    {
      method: "PATCH",
      body: {
        language: "en",
        country: "eg",
        timezone: "Africa/Cairo",
      },
    }
  );
  assert.equal(accountUpdate.body.data.country, "EG");

  const health = await request("/api/profiles/me/health", {
    method: "PUT",
    body: {
      healthConditions: [
        { code: "CHEST_PAIN", notes: null, active: true },
      ],
      movementLimitations: [],
      specialPlanningStates: [],
      safetyNotes: null,
    },
  });
  assert.equal(health.response.status, 200);
  assert.equal(health.body.data.requiresProfessionalClearance, true);
  assert.equal("bodyProfileId" in health.body.data, false);

  const nutrition = await request("/api/profiles/me/nutrition", {
    method: "PUT",
    body: {
      dietaryPreferenceCodes: ["HALAL"],
      foodAllergies: [],
      foodIntolerances: [],
      foodPreferences: [],
      mealsPerDay: 3,
      snacksPerDay: 1,
      planStyle: "FLEXIBLE_MEALS",
      cookingSkill: "BASIC",
      maxMealPrepMinutes: 30,
      kitchenAccess: "FULL",
      foodBudgetLevel: "MODERATE",
    },
  });
  assert.equal(nutrition.response.status, 200);

  const training = await request("/api/profiles/me/training", {
    method: "PUT",
    body: {
      overallExperienceLevel: "BEGINNER",
      resistanceTrainingLevel: "BEGINNER",
      cardioTrainingLevel: "BEGINNER",
      currentlyTrainingConsistently: false,
      trainingDaysPerWeek: 2,
      availableDays: [
        { day: 1, available: true, preferred: true, maxMinutes: 60 },
        { day: 4, available: true, preferred: false, maxMinutes: 45 },
      ],
      preferredSessionMinutes: 45,
      trainingEnvironment: "COMMERCIAL_GYM",
      availableEquipment: [],
      preferredTrainingStyles: ["FULL_BODY"],
      preferredCardioType: "WALKING",
      averageSleepMinutes: 480,
      sleepQuality: 7,
      typicalStressLevel: 4,
    },
  });
  assert.equal(training.response.status, 200);

  const coaching = await request("/api/profiles/me/coaching", {
    method: "PUT",
    body: {
      coachingStyle: "BALANCED",
      explanationLevel: "NORMAL",
      motivationStyle: "ENCOURAGING",
      checkinFrequency: "WEEKLY",
      proactiveCoaching: false,
      workoutReminders: false,
      nutritionReminders: false,
    },
  });
  assert.equal(coaching.response.status, 200);
  assert.equal("userId" in coaching.body.data, false);

  const progress = await request("/api/profiles/me/progress", {
    method: "POST",
    body: {
      weightKg: 81.8,
      bodyFatPercentage: 20,
      skeletalMuscleMassKg: 35,
      restingHeartRateBpm: 62,
      measurements: [
        { measurementType: "WAIST", valueCm: 84.5 },
      ],
      notes: "Morning measurement",
    },
  });
  assert.equal(progress.response.status, 201);

  const profile = await request("/api/profiles/me");
  assert.equal(profile.response.status, 200);
  assert.equal(profile.body.data.bodyProfile.currentBodyState.weightKg, 81.8);
  assert.equal(
    profile.body.data.bodyProfile.healthProfile
      .requiresProfessionalClearance,
    true
  );

  const targets = await request("/api/profiles/me/targets");
  assert.equal(targets.response.status, 200);
  assert.ok(targets.body.data.dailyCalories > 0);
  assert.equal(targets.body.data.basedOn.weightKg, 81.8);

  const wrongPassword = await request("/api/profiles/me/body", {
    method: "DELETE",
    body: { password: "wrong-password" },
  });
  assert.equal(wrongPassword.response.status, 403);
  assert.equal(wrongPassword.body.code, "INVALID_PASSWORD_CONFIRMATION");

  const deletion = await request("/api/profiles/me/body", {
    method: "DELETE",
    body: { password },
  });
  assert.equal(deletion.response.status, 204);

  const afterDeletion = await request("/api/profiles/me");
  assert.equal(afterDeletion.body.data.bodyProfile, null);
  assert.equal(afterDeletion.body.data.userProfile.firstName, "Nour");
  assert.equal(afterDeletion.body.data.coachingPreferences.coachingStyle, "BALANCED");

  const recreatedBody = await request("/api/profiles/me/body", {
    method: "POST",
    body: {
      birthDate: "2000-06-15",
      adultConfirmed: true,
      sexForCalculation: "MALE",
      preferredUnitSystem: "METRIC",
      heightCm: 178,
      startingWeightKg: 80,
      activityLevel: "LIGHTLY_ACTIVE",
    },
  });
  assert.equal(recreatedBody.response.status, 201);
  assert.equal(recreatedBody.body.data.currentBodyState.weightKg, 80);
});
