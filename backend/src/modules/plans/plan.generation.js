// this file have the WHOLE generation logic resposibility 

// the service already called 

// const generatedPlan = await generatePlanWithAI({
//     context: aiContext,
//     userId,
//     db,
//   });

// so the context is service reposibility 
// the service expect a vaild plan returned 
// so we here must do in order 
// 1. send tools request to the provider 
// 2. validate the tools response <the scgema already exists in the plan.tools.schema.js>
// 3. build the tools response into a valid plan proposal
//4. return the plan proposal to the service
// 5. here we will validate the plan proposal and the service persist it as a DRAFT
import { sendToolCallRequestToGroq, 
    sendContentGenerationRequestToGroq
 } from "../../providers/ai/groq.provider.js";
import { buildPlanSearchPrompt, 
    buildPlanGenerationPrompt
} from "./plan.prompt.js";
import { createPlanTools } from "./plan.tools.js";
import { generatedPlanSchema } from "./plan.content-schema.js";

import {
  AIProviderError,
  AIProviderRateLimitError,
  AIProviderTimeoutError,
  AIProviderUnavailableError,
  AIProviderInvalidResponseError,
  AIProviderRefusalError,
  AIProviderTruncatedResponseError,
} from "../../middlewares/errorHandling.js";

export async function generatePlanWithAI({
  context,
  source,
  userId,
  db,
}) {
  // 1. Prepare searches bound to this authenticated user.
  const tools = createPlanTools({ userId, source, db });

  // 2. Build the instructions.
  
  const searchPrompt = buildPlanSearchPrompt({ context });

  // 3. Ask Groq what to search for.
  const toolCalls = await sendToolCallRequestToGroq(
    [
      { role: "system", content: searchPrompt.system },
      { role: "user", content: searchPrompt.user },
    ],
    tools.definitions
  );

  // 4. The provider already checks that exactly one call was returned.
  const call = toolCalls[0];

  // 5. THIS runs the actual database searches.
  const batch = await tools.execute(call.name, call.arguments);

  if (!batch.ok) {
    throw new Error(batch.error.message);
  }

  // 6. Prepare the next AI request with the actual search results.
  const generationPrompt = buildPlanGenerationPrompt({
    context,
    toolResults: batch.results,
  });

  // Next: send generationPrompt to Groq and validate the returned plan.
  const generatedContent =
  await sendContentGenerationRequestToGroq(
    [
      { role: "system", content: generationPrompt.system },
      { role: "user", content: generationPrompt.user },
    ],
    generationPrompt.responseSchema
  );

let parsedPlan;

try {
  parsedPlan = JSON.parse(generatedContent);
} catch {
  throw new AIProviderInvalidResponseError(
    "AI provider returned invalid JSON content."
  );
}

const result = generatedPlanSchema.safeParse(parsedPlan);

if (!result.success) {
  throw new AIProviderInvalidResponseError(
    "AI provider returned invalid plan content."
  );
}

return result.data;

}