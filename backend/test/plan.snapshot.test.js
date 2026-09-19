import assert from "node:assert/strict";
import { test } from "node:test";

Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://spotter:spotter@localhost:5432/spotter_test",
  FRONTEND_URL: "http://localhost:5173",
  ACCESS_TOKEN_SECRET: Buffer.alloc(32, 1).toString("base64url"),
  EMAIL_USER: "test@example.com",
  EMAIL_APP_PASSWORD: "test-password",
  CLOUD_NAME: "test",
  CLOUD_API_KEY: "test",
  CLOUD_API_SECRET: "test",
  GROQ_API_KEY: "test",
  GROQ_MODEL_NAME: "test",
});

const { buildDraftInput } = await import("../src/modules/plans/plan.service.js");
const { serializePlan } = await import("../src/modules/plans/plan.serializer.js");

const userId = "11111111-1111-4111-8111-111111111111";
const foodId = "22222222-2222-4222-8222-222222222222";
const recipeId = "33333333-3333-4333-8333-333333333333";
const exerciseId = "44444444-4444-4444-8444-444444444444";

function mockCatalog() {
  const foods = new Map();
  foods.set(foodId.toLowerCase(), {
    id: foodId,
    nameEn: "Chicken Breast",
    nameAr: "صدور دجاج",
    category: "POULTRY",
    caloriesPer100g: 165,
    proteinGramsPer100g: 31,
    carbohydrateGramsPer100g: 0,
    fatGramsPer100g: 3.6,
  });

  const recipes = new Map();
  recipes.set(recipeId.toLowerCase(), {
    id: recipeId,
    nameEn: "Oatmeal Bowl",
    nameAr: "شوفان",
    servings: 1,
    caloriesPerServing: 300,
    proteinGramsPerServing: 12,
    carbohydrateGramsPerServing: 50,
    fatGramsPerServing: 6,
  });

  const exercises = new Map();
  exercises.set(exerciseId.toLowerCase(), {
    id: exerciseId,
    name: "Barbell Bench Press",
    exerciseType: "STRENGTH",
    equipment: "BARBELL",
    primaryMuscles: ["CHEST"],
  });

  return { foods, recipes, exercises };
}

test("buildDraftInput embeds immutable snapshots when catalog is provided", () => {
  const catalog = mockCatalog();
  const context = {
    userId,
    source: { user: { id: userId, timezone: "Africa/Cairo" }, goal: { id: "goal-1" }, nutritionProfile: { planStyle: "EXACT_MEALS" } },
    targets: { dailyCalories: 2000, proteinGrams: 150, carbohydrateGrams: 200, fatGrams: 60 },
    template: null,
    input: { startDate: "2026-10-01", endDate: "2026-10-31" },
    plan: {
      title: "Snapshot Plan",
      explanation: "Testing snapshots",
      days: [{
        dayOfWeek: "MONDAY",
        nutritionGuidance: null,
        notes: "Day 1",
        breakfastOptions: [{
          label: "Breakfast 1",
          note: null,
          items: [
            { itemType: "FOOD", foodId, quantityGrams: 200 }, // 200g * 165 cal/100g = 330 cal
          ],
        }],
        lunchOptions: [{
          label: "Lunch 1",
          note: null,
          items: [
            { itemType: "RECIPE", recipeId, servings: 1.5 }, // 1.5 * 300 = 450 cal
          ],
        }],
        dinnerOptions: null,
        snackOptions: null,
        workouts: [{
          slot: "MORNING",
          name: "Chest Day",
          estimatedDurationMinutes: 45,
          notes: null,
          exercises: [{
            exerciseId,
            setsCount: 4,
            repMin: 8,
            repMax: 10,
            restSeconds: 90,
          }],
        }],
      }],
    },
    catalog,
  };

  const draftInput = buildDraftInput(context);
  const day = draftInput.draftData.days.create[0];

  // 1. Food snapshot in breakfast
  const breakfastOption = day.breakfastOptions[0];
  assert.equal(breakfastOption.items[0].itemName, "Chicken Breast");
  assert.equal(breakfastOption.items[0].calories, 330);
  assert.equal(breakfastOption.items[0].proteinGrams, 62);
  assert.equal(breakfastOption.items[0].fatGrams, 7.2);
  assert.equal(breakfastOption.totalNutrition.calories, 330);
  assert.equal(breakfastOption.totalNutrition.proteinGrams, 62);

  // 2. Recipe snapshot in lunch
  const lunchOption = day.lunchOptions[0];
  assert.equal(lunchOption.items[0].itemName, "Oatmeal Bowl");
  assert.equal(lunchOption.items[0].calories, 450);
  assert.equal(lunchOption.items[0].proteinGrams, 18);
  assert.equal(lunchOption.items[0].carbohydrateGrams, 75);
  assert.equal(lunchOption.totalNutrition.calories, 450);

  // 3. Exercise snapshot in workout
  const workout = day.workouts.create[0];
  assert.equal(workout.exercises[0].exerciseName, "Barbell Bench Press");
  assert.equal(workout.exercises[0].category, "STRENGTH");
  assert.equal(workout.exercises[0].equipment, "BARBELL");
  assert.deepEqual(workout.exercises[0].primaryMuscles, ["CHEST"]);
  assert.equal(workout.exercises[0].setsCount, 4);
});

test("serializePlan is a pure synchronous function that formats snapshotted plans", () => {
  const rawPlan = {
    id: "plan-1",
    userId,
    goalId: "goal-1",
    sourceTemplateId: null,
    status: "ACTIVE",
    nutritionPlanStyle: "EXACT_MEALS",
    timezone: "Africa/Cairo",
    title: "Test Plan",
    explanation: "Explanation",
    calorieTarget: 2000,
    proteinTargetGrams: 150,
    carbohydrateTargetGrams: 200,
    fatTargetGrams: 60,
    startDate: new Date("2026-10-01"),
    endDate: new Date("2026-10-31"),
    activatedAt: new Date("2026-10-01"),
    endedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    days: [{
      id: "day-1",
      dayOfWeek: "MONDAY",
      breakfastOptions: [{
        label: "Breakfast",
        totalNutrition: { calories: 330, proteinGrams: 62, carbohydrateGrams: 0, fatGrams: 7.2 },
        items: [{
          itemType: "FOOD",
          foodId,
          itemName: "Chicken Breast",
          calories: 330,
        }],
      }],
      workouts: [{
        id: "workout-1",
        slot: "MORNING",
        orderIndex: 0,
        name: "Upper Body",
        estimatedDurationMinutes: 45,
        exercises: [{
          exerciseId,
          exerciseName: "Barbell Bench Press",
          setsCount: 3,
        }],
        notes: null,
      }],
    }],
  };

  const serialized = serializePlan(rawPlan);

  assert.equal(serialized.id, "plan-1");
  assert.equal(serialized.days[0].breakfastOptions[0].items[0].itemName, "Chicken Breast");
  assert.equal(serialized.days[0].workouts[0].exercises[0].exerciseName, "Barbell Bench Press");
});
