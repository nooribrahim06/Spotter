import { randomUUID } from "node:crypto";
import * as planRepository from "./plan.repository.js";
import { evaluatePlanReadiness, checkPlanActivation } from "./plan.rules.js";
import { calculateFitnessTargets } from "../profiles/profile.targets.js";
import {
  InvalidAccessTokenError,
  PlanDraftConflictError,
  PlanNotFoundError,
  PlanActivationConflictError,
} from "../../middlewares/errorHandling.js";
import { findCompatibleTemplate } from "./planTemplate.repository.js";
import { buildPlanGenerationContext } from "./plan.context.js";
import { createPlanTools } from "./plans-generation/plan.tools.js";
import { generatePlanWithAI } from "./plan.generation.js";
import { prepareGeneratedPlanValidation, validateGeneratedPlanForContext } from "./plans-generation/plan-generated.rules.js";

export async function activatePlan(userId, planId, input, db) {
  // 1. Load the reviewed plan. A repeated activation is already complete.
  const plan = await getPlanById(userId, planId, db);
  if (plan.status === "ACTIVE") return plan;
  if (plan.status !== "DRAFT") {
    throw new PlanActivationConflictError("Only a draft plan can be activated.", "PLAN_NOT_DRAFT");
  }

  // 2. Check today's user context and the selected catalog records.
  const source = await planRepository.getPlanGenerationSourceData(userId, db);
  const targets = checkPlanActivation(plan, source);
  const catalog = await planRepository.loadActivationCatalog(userId, plan, db);
  validateGeneratedPlanForContext({
    generatedPlan: plan,
    source,
    toolResults: catalog,
    validationContext: prepareGeneratedPlanValidation({ source, targets }),
  });

  // 3. Switch statuses atomically. No validation callbacks enter the repository.
  return planRepository.activateOwnedPlan(userId, planId, input.expectedActivePlanId, db);
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
  return plan;
}

export async function getActivePlan(userId, db) {
  return planRepository.findActivePlan(userId, db);
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

  return persistGeneratedDraft({ userId, source, targets, template, input,
    plan: validated.plan }, db);
}

// The repository owns locks/transactions; the service owns public conflict errors.
export async function persistGeneratedDraft(context, db) {
  const result = await planRepository.saveDraftIfUnchanged(buildDraftInput(context), db);
  if (!result.ok) throw new PlanDraftConflictError();
  return result.plan;
}

function addMealOptionIds(options) {
  return options?.map((option) => ({ ...option, id: randomUUID() })) ?? null;
}

// Map the already-validated proposal to draft fields. No catalog checks here.
export function buildDraftInput({ userId, source, targets, template, input, plan }) {
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
          breakfastOptions: addMealOptionIds(day.breakfastOptions),
          lunchOptions: addMealOptionIds(day.lunchOptions),
          dinnerOptions: addMealOptionIds(day.dinnerOptions),
          snackOptions: addMealOptionIds(day.snackOptions),
          nutritionGuidance: day.nutritionGuidance,
          notes: day.notes,
          workouts: {
            create: day.workouts.map((workout, orderIndex) => ({
              slot: workout.slot,
              orderIndex,
              name: workout.name,
              estimatedDurationMinutes: workout.estimatedDurationMinutes,
              exercises: workout.exercises,
              notes: workout.notes,
            })),
          },
        })),
      },
    },
  };
}
