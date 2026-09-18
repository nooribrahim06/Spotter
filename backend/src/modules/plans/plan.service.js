import * as planRepository from "./plan.repository.js";
import { evaluatePlanReadiness } from "./plan.rules.js";
import { calculateFitnessTargets } from "../profiles/profile.targets.js";
import {
  InvalidAccessTokenError,
} from "../../middlewares/errorHandling.js";
import { findCompatibleTemplate } from "./planTemplate.repository.js";
import { buildPlanGenerationContext } from "./plan.context.js";
import { createPlanTools } from "./plans-generation/plan.tools.js";
import { generatePlanWithAI } from "./plan.generation.js";
import { prepareGeneratedPlanValidation, validateGeneratedPlanForContext } from "./plans-generation/plan-generated.rules.js";
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
// 5. Call the AI generation adapter and return the generated plan proposal.
export async function generatePlan(userId, input, db) {
  // 1. Load authoritative user context
  const source =
    await planRepository.getPlanGenerationSourceData(userId, db);

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

  // This endpoint currently returns a validated proposal. Draft persistence,
  // a fresh context/access check, and the transaction are the next stage.
  return validated.plan;
}
