import { randomUUID } from "node:crypto";
import { formatInTimeZone } from "date-fns-tz";
import * as planRepository from "./plan.repository.js";
import { evaluatePlanReadiness, checkPlanActivation, getWeekdayForDate, getPlanDayForWeekday } from "./plan.rules.js";
import { calculateFitnessTargets } from "../profiles/profile.targets.js";
import {
  InvalidAccessTokenError,
  PlanDraftConflictError,
  PlanNotFoundError,
  PlanActivationConflictError,
  PlanContentInvalidError,
} from "../../middlewares/errorHandling.js";
import { findCompatibleTemplate } from "./planTemplate.repository.js";
import { buildPlanGenerationContext } from "./plan.context.js";
import { createPlanTools } from "./plans-generation/plan.tools.js";
import { generatePlanWithAI } from "./plan.generation.js";
import { prepareGeneratedPlanValidation, validateGeneratedPlanForContext } from "./plans-generation/plan-generated.rules.js";
import { serializePlan } from "./plan.serializer.js";

export async function activatePlan(userId, planId, input, db) {
  // 1. Load the reviewed plan. A repeated activation is already complete.
  const plan = await getPlanById(userId, planId, db);
  if (plan.status === "ACTIVE") return plan;
  if (plan.status !== "DRAFT") {
    throw new PlanActivationConflictError("Only a draft plan can be activated.", "PLAN_NOT_DRAFT");
  }

  // 2. Check today's user context and the selected catalog records.
  const source = await planRepository.getPlanGenerationSourceData(userId, db);
  checkPlanActivation(plan, source);
  const selectionsAvailable = await planRepository.arePlanSelectionsAvailable(userId, plan, db);
  if (!selectionsAvailable) {
    throw new PlanContentInvalidError([{
      code: "PLAN_SELECTION_UNAVAILABLE",
      message: "A selected exercise, food, recipe, or recipe ingredient is no longer available to you.",
    }]);
  }

  // 3. Switch statuses atomically. No validation callbacks enter the repository.
  return planRepository.activateOwnedPlan(userId, planId, input.expectedActivePlanId, db);
}

export async function endActivePlan(userId, planId, db) {
  return planRepository.endOwnedActivePlan(userId, planId, db);
}

export async function discardDraftPlan(userId, planId, db) {
  return planRepository.discardOwnedDraftPlan(userId, planId, db);
}

export async function listPlans(userId, query, db) {
  const { items, totalItems } = await planRepository.findPlans(userId, query, db);
  return {
    items,
    pagination: {
      page: query.page,
      limit: query.limit,
      totalItems,
      totalPages: Math.ceil(totalItems / query.limit),
      hasNextPage: query.page * query.limit < totalItems,
    },
  };
}

export async function getPlanById(userId, planId, db) {
  const plan = await planRepository.findOwnedPlanById(userId, planId, db);
  if (!plan) throw new PlanNotFoundError();
  return serializePlan(plan);
}

export async function getActivePlan(userId, db) {
  const plan = await planRepository.findActivePlan(userId, db);
  if (!plan) return null;

  const today = formatInTimeZone(new Date(), plan.timezone, "yyyy-MM-dd");
  const end = plan.endDate?.toISOString().slice(0, 10);
  if (end && today > end) {
    return null;
  }

  return serializePlan(plan);
}

export async function getDailySchedule(userId, dateString, db) {
  const plan = await planRepository.findPlanForDate(userId, dateString, db);
  if (!plan) {
    return { plan: null, day: null };
  }

  const weekday = getWeekdayForDate(dateString, plan.timezone);
  const serializedPlan = serializePlan(plan);
  const day = getPlanDayForWeekday(serializedPlan, weekday);

  return {
    plan: {
      id: plan.id,
      title: plan.title,
      timezone: plan.timezone,
      status: plan.status,
    },
    day,
  };
}

export async function getPlanContext(userId, db) {
  const source = await planRepository.getPlanGenerationSourceData(userId, db);

  // The account could have been removed after authentication completed.
  if (!source.user) throw new InvalidAccessTokenError();

  const readiness = evaluatePlanReadiness(source);
  const targetPreview = readiness.ready
    ? calculateFitnessTargets({
        bodyProfile: source.bodyProfile,
        goal: source.goal,
        progressEntry: source.latestProgress,
      })
    : null;

  // Return readiness, not the private source records used to evaluate it.
  return {
    ...readiness,
    targetPreview,
  };
}
// 1. Load the user's generation context (profile, active goal, constraints, etc.).
// 2. Validate that the user has all required data to generate a plan.
// 3. Calculate backend-owned targets and select a compatible plan template.
// 4. Build the complete, bounded AI generation context.
// 5. Generate and validate, then atomically check context and save a draft.
export async function generatePlan(userId, input, db) {
  // 1. Load authoritative user context
  const source =
    await planRepository.getPlanGenerationSourceData(userId, db);
  if (!source.user) throw new InvalidAccessTokenError();

  // Authenticate/bind the tool session and check readiness ONCE.
  // getPlanContext() is a separate HTTP request and evaluates readiness itself.
  const tools = createPlanTools({ userId, source, db });

  // 3. Calculate backend-owned targets
  const targets = calculateFitnessTargets({
    bodyProfile: source.bodyProfile,
    goal: source.goal,
    progressEntry: source.latestProgress,
  });

  // Prepare nutrition targets, allowed deviations, and required meal slots
  // for validating the AI's response. Fail early if backend settings are invalid.
  const validationContext = prepareGeneratedPlanValidation({ source, targets });

  // 4. Select generation reference
  const template = await findCompatibleTemplate({
    goalType: source.goal.goalType,
    experienceLevel: source.trainingProfile.overallExperienceLevel,
    db,
  });

  // 5. Build AI context
  const aiContext = buildPlanGenerationContext({
    source,
    targets,
    template,
    input,
  });

  // 6. Generator runs the two AI requests and checks the output shape once.
  const { plan, toolResults } = await generatePlanWithAI({
    context: aiContext,
    tools,
  });

  // 7. Check the selected catalog IDs and user-specific business rules once.
  const validated = validateGeneratedPlanForContext({
    generatedPlan: plan,
    source,
    toolResults,
    validationContext, // this is what we prepared above before the AI call, not the AI's output
  });

  return persistGeneratedDraft({
    userId,
    source,
    targets,
    template,
    input,
    plan: validated.plan,
    catalog: validated.catalog,
  }, db);
}

// The repository owns locks/transactions; the service owns public conflict errors.
export async function persistGeneratedDraft(context, db) {
  const result = await planRepository.saveDraftIfUnchanged(buildDraftInput(context), db);
  if (!result.ok) throw new PlanDraftConflictError();
  return result.plan;
}

function roundTwoDecimals(val) {
  return typeof val === "number" && Number.isFinite(val) ? Math.round(val * 100) / 100 : null;
}

function snapshotMealOption(option, catalog) {
  if (!option) return null;
  let optionCalories = 0;
  let optionProtein = 0;
  let optionCarbs = 0;
  let optionFat = 0;
  let hasNutrition = false;

  const items = option.items?.map((item) => {
    const isFood = item.itemType === "FOOD";
    const id = isFood ? item.foodId : item.recipeId;
    const candidate = catalog
      ? (isFood ? catalog.foods.get(id?.toLowerCase()) : catalog.recipes.get(id?.toLowerCase()))
      : null;

    let calories = item.calories ?? null;
    let proteinGrams = item.proteinGrams ?? null;
    let carbohydrateGrams = item.carbohydrateGrams ?? null;
    let fatGrams = item.fatGrams ?? null;
    const itemName = item.itemName || item.name || candidate?.nameEn || candidate?.name || candidate?.nameAr || null;

    if (candidate) {
      if (isFood && Number.isFinite(item.quantityGrams)) {
        const factor = Number(item.quantityGrams) / 100;
        if (candidate.caloriesPer100g != null) calories = roundTwoDecimals(Number(candidate.caloriesPer100g) * factor);
        if (candidate.proteinGramsPer100g != null) proteinGrams = roundTwoDecimals(Number(candidate.proteinGramsPer100g) * factor);
        if (candidate.carbohydrateGramsPer100g != null) carbohydrateGrams = roundTwoDecimals(Number(candidate.carbohydrateGramsPer100g) * factor);
        if (candidate.fatGramsPer100g != null) fatGrams = roundTwoDecimals(Number(candidate.fatGramsPer100g) * factor);
      } else if (!isFood && Number.isFinite(item.servings)) {
        const factor = Number(item.servings);
        if (candidate.caloriesPerServing != null) calories = roundTwoDecimals(Number(candidate.caloriesPerServing) * factor);
        if (candidate.proteinGramsPerServing != null) proteinGrams = roundTwoDecimals(Number(candidate.proteinGramsPerServing) * factor);
        if (candidate.carbohydrateGramsPerServing != null) carbohydrateGrams = roundTwoDecimals(Number(candidate.carbohydrateGramsPerServing) * factor);
        if (candidate.fatGramsPerServing != null) fatGrams = roundTwoDecimals(Number(candidate.fatGramsPerServing) * factor);
      }
    }

    if (calories != null) { optionCalories += calories; hasNutrition = true; }
    if (proteinGrams != null) { optionProtein += proteinGrams; hasNutrition = true; }
    if (carbohydrateGrams != null) { optionCarbs += carbohydrateGrams; hasNutrition = true; }
    if (fatGrams != null) { optionFat += fatGrams; hasNutrition = true; }

    const itemSnapshot = { ...item };
    if (itemName) {
      itemSnapshot.name = itemName;
      itemSnapshot.itemName = itemName;
    }
    if (candidate?.nameEn) itemSnapshot.nameEn = candidate.nameEn;
    if (candidate?.nameAr) itemSnapshot.nameAr = candidate.nameAr;
    if (calories != null) itemSnapshot.calories = calories;
    if (proteinGrams != null) itemSnapshot.proteinGrams = proteinGrams;
    if (carbohydrateGrams != null) itemSnapshot.carbohydrateGrams = carbohydrateGrams;
    if (fatGrams != null) itemSnapshot.fatGrams = fatGrams;

    return itemSnapshot;
  }) ?? [];

  const optionSnapshot = {
    id: option.id || randomUUID(),
    label: option.label,
    items,
    note: option.note ?? null,
  };

  if (hasNutrition || option.totalNutrition) {
    optionSnapshot.totalNutrition = option.totalNutrition || {
      calories: roundTwoDecimals(optionCalories),
      proteinGrams: roundTwoDecimals(optionProtein),
      carbohydrateGrams: roundTwoDecimals(optionCarbs),
      fatGrams: roundTwoDecimals(optionFat),
    };
  }

  return optionSnapshot;
}

function snapshotMealOptions(options, catalog) {
  return options?.map((opt) => snapshotMealOption(opt, catalog)) ?? null;
}

function snapshotExercises(exercises, catalog) {
  return exercises?.map((exercise) => {
    const candidate = catalog ? catalog.exercises.get(exercise.exerciseId?.toLowerCase()) : null;
    const exerciseName = exercise.exerciseName || exercise.name || candidate?.name || candidate?.nameEn || null;
    const exerciseSnapshot = { ...exercise };
    if (exerciseName) {
      exerciseSnapshot.name = exerciseName;
      exerciseSnapshot.exerciseName = exerciseName;
    }
    const category = exercise.category || candidate?.exerciseType || candidate?.category || null;
    if (category) exerciseSnapshot.category = category;
    const equipment = exercise.equipment || candidate?.equipment || null;
    if (equipment) exerciseSnapshot.equipment = equipment;
    const primaryMuscles = exercise.primaryMuscles || candidate?.primaryMuscles || null;
    if (primaryMuscles) exerciseSnapshot.primaryMuscles = primaryMuscles;
    return exerciseSnapshot;
  }) ?? [];
}

// Map the already-validated proposal to draft fields with immutable snapshots.
export function buildDraftInput({ userId, source, targets, template, input, plan, catalog = null }) {
  return {
    userId,
    expectedContext: source,
    draftData: {
      userId,
      goalId: source.goal.id,
      sourceTemplateId: template?.id ?? null,
      status: "DRAFT",
      nutritionPlanStyle: source.nutritionProfile.planStyle,
      timezone: source.user.timezone,
      title: plan.title,
      explanation: plan.explanation,
      calorieTarget: targets.dailyCalories,
      proteinTargetGrams: targets.proteinGrams,
      carbohydrateTargetGrams: targets.carbohydrateGrams,
      fatTargetGrams: targets.fatGrams,
      // Requested schedule dates are stored; activation timestamps remain null.
      startDate: new Date(`${input.startDate}T00:00:00Z`),
      endDate: new Date(`${input.endDate}T00:00:00Z`),
      days: {
        create: plan.days.map((day) => ({
          dayOfWeek: day.dayOfWeek,
          breakfastOptions: snapshotMealOptions(day.breakfastOptions, catalog),
          lunchOptions: snapshotMealOptions(day.lunchOptions, catalog),
          dinnerOptions: snapshotMealOptions(day.dinnerOptions, catalog),
          snackOptions: snapshotMealOptions(day.snackOptions, catalog),
          nutritionGuidance: day.nutritionGuidance,
          notes: day.notes,
          workouts: {
            create: day.workouts.map((workout, orderIndex) => ({
              slot: workout.slot,
              orderIndex,
              name: workout.name,
              estimatedDurationMinutes: workout.estimatedDurationMinutes,
              exercises: snapshotExercises(workout.exercises, catalog),
              notes: workout.notes,
            })),
          },
        })),
      },
    },
  };
}
