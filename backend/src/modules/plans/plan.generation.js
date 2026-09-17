/**
 * Same straight-line flow as the original generator:
 * ask for searches -> execute them -> ask for plan -> parse -> validate.
 *
 * The service supplies a tool session already bound to the authenticated user.
 * Tool argument validation belongs to that session, not this file.
 * Returns { plan, toolResults } so the service can apply business rules using
 * exactly the catalog records the model received. Does not save anything.
 */
import { Buffer } from "node:buffer";
import { PLAN_GENERATION_LIMITS, CONCRETE_MEAL_PLAN_STYLES } from "../../config/plan.js";
import {
  sendToolCallRequestToGroq,
  sendContentGenerationRequestToGroq,
} from "../../providers/ai/groq.provider.js";
import { buildPlanSearchPrompt, buildPlanGenerationPrompt } from "./plans-generation/plan.prompt.js";
import { generatedPlanSchema } from "./plans-generation/plan.content-schema.js";
import {
  AIProviderInvalidResponseError,
  PlanGenerationError,
} from "../../middlewares/errorHandling.js";

export async function generatePlanWithAI({ context, tools }) {
  // 1. The service already created tools for this user and checked readiness.
  const searchPrompt = buildPlanSearchPrompt({ context });

  // 2. Ask Groq which searches it needs. This does not search the database.
  const toolCalls = await sendToolCallRequestToGroq(
    [
      { role: "system", content: searchPrompt.system },
      { role: "user", content: searchPrompt.user },
    ],
    tools.definitions
  );

  // 3. Run the searches. The provider already guarantees one tool call;
  // tools.execute() parses/validates its arguments and queries the database.
  const call = toolCalls[0];
  const batch = await tools.execute(call.name, call.arguments);
  if (!batch.ok) {
    throw new PlanGenerationError(
      batch.error.message, batch.error.code, batch.error.details
    );
  }

  // 4. Avoid a wasted second AI call when required categories are empty.
  // This is not proof that candidates fit; the final rules check selections.
  const hasExercises = batch.results.some((entry) =>
    entry.name === "searchExercises" && entry.result.ok && entry.result.items.length > 0
  );
  const hasMeals = batch.results.some((entry) =>
    (entry.name === "searchFoods" || entry.name === "searchRecipes") &&
    entry.result.ok && entry.result.items.length > 0
  );
  const needsMeals = CONCRETE_MEAL_PLAN_STYLES.includes(
    context.user.nutritionPlanStyle
  );
  if (!hasExercises || (needsMeals && !hasMeals)) {
    throw new PlanGenerationError(
      "The catalog searches did not provide the required candidates.",
      "PLAN_CANDIDATES_UNAVAILABLE",
      { missing: [
        ...(!hasExercises ? ["exercises"] : []),
        ...(needsMeals && !hasMeals ? ["foodsOrRecipes"] : []),
      ] }
    );
  }

  // 5. Send actual search results to Groq and ask for the plan.
  const generationPrompt = buildPlanGenerationPrompt({
    context,
    toolResults: batch.results,
  });
  const generatedContent = await sendContentGenerationRequestToGroq(
    [
      { role: "system", content: generationPrompt.system },
      { role: "user", content: generationPrompt.user },
    ],
    generationPrompt.responseSchema
  );

  // 6. Bound the returned text before parsing it.
  if (Buffer.byteLength(generatedContent, "utf8") > PLAN_GENERATION_LIMITS.contentBytes) {
    throw new AIProviderInvalidResponseError("The generated plan response is too large.");
  }
  let parsedPlan;
  try {
    parsedPlan = JSON.parse(generatedContent);
  } catch {
    throw new AIProviderInvalidResponseError("The AI returned invalid JSON content.");
  }

  // 7. Keep your original Zod check. It runs once, here.
  const result = generatedPlanSchema.safeParse(parsedPlan);
  if (!result.success) {
    throw new AIProviderInvalidResponseError("The AI returned invalid plan content.");
  }

  // 8. Return the plan AND its catalog evidence for the service's business checks.
  return { plan: result.data, toolResults: batch.results };
}
