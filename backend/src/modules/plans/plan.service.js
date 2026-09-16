import * as planRepository from "./plan.repository.js";
import { evaluatePlanReadiness } from "./plan.rules.js";
import { calculateFitnessTargets } from "../profiles/profile.targets.js";
import {
  InvalidAccessTokenError,
  PlanContextIncompleteError,
  PlanNotEligibleError,
} from "../../middlewares/errorHandling.js";
import { findCompatibleTemplate } from "./planTemplate.repository.js";
import { buildPlanGenerationContext } from "./plan.context.js";
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

  if (!source.user) {
    throw new InvalidAccessTokenError();
  }

  // 2. Check readiness
  const readiness = evaluatePlanReadiness(source);

  // Preserve actionable readiness details without exposing private profiles.
  if (readiness.blocked) {
    throw new PlanNotEligibleError(readiness);
  }
  if (!readiness.ready) {
    throw new PlanContextIncompleteError(readiness);
  }

  // 3. Calculate backend-owned targets
  const targets = calculateFitnessTargets({
    bodyProfile: source.bodyProfile,
    goal: source.goal,
    progressEntry: source.latestProgress,
  });

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

  // 6. AI generates plan and uses catalog tools itself
  // not currently implemented 
  const generatedPlan = await generatePlanWithAI({
    context: aiContext,
    userId,
    db,
  });

  // later:
  // validate generatedPlan
  // recheck context
  // persist DRAFT

  return generatedPlan;
}
