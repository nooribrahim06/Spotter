import assert from "node:assert/strict";
import { test } from "node:test";
Object.assign(process.env, {
  NODE_ENV: "test", DATABASE_URL: "postgresql://spotter:spotter@localhost:5432/spotter_test",
  FRONTEND_URL: "http://localhost:5173", ACCESS_TOKEN_SECRET: Buffer.alloc(32, 1).toString("base64url"),
  EMAIL_USER: "test@example.com", EMAIL_APP_PASSWORD: "test-password",
  CLOUD_NAME: "test", CLOUD_API_KEY: "test", CLOUD_API_SECRET: "test",
  GROQ_API_KEY: "test", GROQ_MODEL_NAME: "test",
});
const { buildDraftInput } = await import("../src/modules/plans/plan.service.js");

const userId = "11111111-1111-4111-8111-111111111111";
const exerciseId = "22222222-2222-4222-8222-222222222222";
const foodId = "33333333-3333-4333-8333-333333333333";
const recipeId = "44444444-4444-4444-8444-444444444444";

function context() {
  return {
    userId,
    source: { user: { id: userId, timezone: "Africa/Cairo" }, goal: { id: "goal" }, nutritionProfile: { planStyle: "EXACT_MEALS" } },
    targets: { dailyCalories: 2000, proteinGrams: 120, carbohydrateGrams: 250, fatGrams: 60 },
    template: null,
    input: { startDate: "2026-10-01", endDate: "2026-10-31" },
    plan: {
      title: "My plan", explanation: "Example", userId: "untrusted", status: "ACTIVE",
      days: [{
        dayOfWeek: "MONDAY", notes: null, nutritionGuidance: null,
        breakfastOptions: [{ label: "Breakfast", note: null, items: [{ itemType: "FOOD", foodId, quantityGrams: 100 }] }],
        lunchOptions: [{ label: "Lunch", note: null, items: [{ itemType: "RECIPE", recipeId, servings: 1 }] }],
        dinnerOptions: null, snackOptions: null,
        workouts: [{ slot: "ANYTIME", name: "Training", estimatedDurationMinutes: 30, notes: null,
          exercises: [{ exerciseId: exerciseId.toUpperCase() }] }],
      }],
    },
  };
}

test("draft mapping owns identity, status, targets, dates and stable option IDs", () => {
  const input = buildDraftInput(context());
  const draft = input.draftData;
  assert.equal(draft.userId, userId);
  assert.equal(draft.status, "DRAFT");
  assert.equal(draft.calorieTarget, 2000);
  assert.equal(draft.sourceTemplateId, null);
  assert.equal(draft.startDate.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(draft.activatedAt, undefined);
  const day = draft.days.create[0];
  assert.equal(day.workouts.create[0].orderIndex, 0);
  assert.match(day.breakfastOptions[0].id, /^[a-f\d-]{36}$/);
  assert.notEqual(day.breakfastOptions[0].id, day.lunchOptions[0].id);
  assert.equal(day.snackOptions, null);
  assert.equal(input.expectedContext.user.id, userId);
  assert.equal("expectedCatalog" in input, false);
  assert.equal("expectedTemplate" in input, false);
});

