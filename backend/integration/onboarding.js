import assert from "node:assert/strict";
import { after, before, test } from "node:test";

const { prisma } = await import("../src/lib/prisma.js");
const { app } = await import("../src/app.js");
const { createAccessToken } = await import(
  "../src/modules/auth/auth.tokens.js"
);

let user;
let server;
let baseUrl;
let accessToken;

before(async () => {
  const unique = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  user = await prisma.user.create({
    data: {
      email: `onboarding_${unique}@example.com`,
      username: `onboard_${unique}`.slice(0, 30),
      passwordHash: "x".repeat(60),
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
    await prisma.user.delete({ where: { id: user.id } });
  }
  await prisma.$disconnect();
});

async function onboardingRequest(path, options = {}) {
  const response = await fetch(`${baseUrl}/api/onboarding${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  return { response, body: await response.json() };
}

test("onboarding saves, resumes, edits, and completes idempotently", async () => {
  // this is a real HTTP + PostgreSQL test, not mocked data. the test user is
  // deleted in after(), and cascade delete removes his session and fitness data.
  const configResult = await onboardingRequest("/config");
  assert.equal(configResult.response.status, 200);
  assert.ok(configResult.body.goalTypes.includes("IMPROVE_FITNESS"));

  const initial = await onboardingRequest("");
  assert.equal(initial.body.status, "not_started");
  assert.equal(initial.body.currentStep, 1);

  const step1 = await onboardingRequest("", {
    method: "PATCH",
    body: JSON.stringify({
      step: 1,
      data: {
        birthYear: 2000,
        birthMonth: 6,
        birthDay: 15,
        adultConfirmed: true,
        sexForCalculation: "MALE",
        preferredUnitSystem: "METRIC",
        heightCm: 178,
        currentWeightKg: 82.5,
      },
    }),
  });
  assert.equal(step1.response.status, 200);
  assert.equal(step1.body.currentStep, 2);

  const step2 = await onboardingRequest("", {
    method: "PATCH",
    body: JSON.stringify({
      step: 2,
      data: {
        goalType: "IMPROVE_FITNESS",
        activityLevel: "MODERATELY_ACTIVE",
      },
    }),
  });
  assert.equal(step2.response.status, 200);
  assert.equal(step2.body.currentStep, 3);

  const resumed = await onboardingRequest("");
  assert.equal(resumed.body.status, "in_progress");
  assert.equal(resumed.body.data.targetWeightKg, null);
  assert.equal(resumed.body.data.targetDate, null);

  const editedStep1 = await onboardingRequest("", {
    method: "PATCH",
    body: JSON.stringify({
      step: 1,
      data: {
        birthYear: 2000,
        birthMonth: 6,
        birthDay: 15,
        adultConfirmed: true,
        sexForCalculation: "MALE",
        preferredUnitSystem: "METRIC",
        heightCm: 180,
        currentWeightKg: 83,
      },
    }),
  });
  assert.equal(editedStep1.body.currentStep, 3);

  const [completed, completedAgain] = await Promise.all([
    // run two requests together to prove the completion claim really prevents
    // duplicate goals or initial progress entries during a race.
    onboardingRequest("/complete", { method: "POST" }),
    onboardingRequest("/complete", { method: "POST" }),
  ]);
  assert.equal(completed.body.status, "completed");
  assert.equal(completedAgain.body.status, "completed");

  const [goals, initialEntries] = await Promise.all([
    prisma.goal.findMany({ where: { userId: user.id } }),
    prisma.progressEntry.findMany({
      where: { userId: user.id, isInitialForGoal: true },
    }),
  ]);

  assert.equal(goals.length, 1);
  assert.equal(goals[0].status, "ACTIVE");
  assert.equal(initialEntries.length, 1);
  assert.equal(Number(initialEntries[0].weightKg), 83);
});
