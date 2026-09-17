// Manual provider check: real Groq requests, no database searches or writes.
// Run from backend/: node test/groq-manual.test.js --live
// Without --live (including npm test), this is skipped before loading env
// or initializing the SDK. A successful run makes two provider requests.

import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import { z } from "zod";
import {
  getPlanToolDefinitions,
  PLAN_CATALOG_TOOL_NAME,
  PLAN_TOOL_LIMITS,
  searchPlanCatalogToolSchema,
} from "../src/modules/plans/plans-generation/plan.tools.schema.js";

// STEP 1: two searches inside ONE real batch-tool call.
// We advertise the production definition but never execute the searches.
// This checks the provider, not database access or permissions.
async function checkToolCalling(sendToolCallRequestToGroq) {
  const toolCalls = await sendToolCallRequestToGroq(
    [
      {
        role: "system",
        content: `Call ${PLAN_CATALOG_TOOL_NAME} exactly once.
Include exactly two searches: searchExercises for "bench press" and
searchFoods for "chicken". Use page 1 and limit 5 for both searches.
Set all other filters to null. Include every required argument key.
Do not return a normal text answer or request separate tool calls.`,
      },
      { role: "user", content: "Request both catalog searches in one batch." },
    ],
    getPlanToolDefinitions()
  );

  assert.ok(Array.isArray(toolCalls), "Expected a tool-call array.");
  assert.equal(toolCalls.length, 1, "Expected exactly one batch tool call.");
  const [call] = toolCalls;
  assert.equal(call.name, PLAN_CATALOG_TOOL_NAME);
  assert.equal(typeof call.id, "string");
  assert.ok(call.id.trim().length > 0, "Expected a nonempty tool-call ID.");

  // The provider returns raw JSON text. Check size BEFORE parsing, then use
  // the same batch validator as the production tool executor.
  assert.equal(typeof call.arguments, "string");
  assert.ok(
    Buffer.byteLength(call.arguments, "utf8") <= PLAN_TOOL_LIMITS.batchArgumentBytes,
    "Batch arguments exceed the allowed size."
  );
  const batch = searchPlanCatalogToolSchema.parse(JSON.parse(call.arguments));
  assert.equal(batch.searches.length, 2);
  assert.deepEqual(
    batch.searches.map((search) => search.name).sort(),
    ["searchExercises", "searchFoods"]
  );

  // Either order is fine, but both requested searches must be present.
  for (const search of batch.searches) {
    const expectedArguments = search.name === "searchExercises"
      ? {
          search: "bench press", exerciseType: null, bodyPart: null,
          difficulty: null, equipment: null, page: 1, limit: 5,
        }
      : { search: "chicken", category: null, page: 1, limit: 5 };
    assert.deepEqual(search.arguments, expectedArguments);
  }

  console.log("PASS: one searchPlanCatalog call contains both valid searches.");
  console.dir(batch, { depth: null });
}

// STEP 2: structured generation using a small output schema.
// This is independent of step 1: no search results were fetched.
// It does not prove the full seven-day schema or generation flow works.
async function checkStructuredOutput(sendContentGenerationRequestToGroq) {
  const outputSchema = z.object({
    title: z.string(),
    exercise: z.object({
      name: z.string(),
      setsCount: z.number().int(),
    }).strict(),
  }).strict();

  const content = await sendContentGenerationRequestToGroq(
    [
      {
        role: "system",
        content: "Return JSON matching the supplied schema. Use the exact requested values.",
      },
      {
        role: "user",
        content: 'Use title "Spotter Test Plan", exercise name "Push Up", and setsCount 3.',
      },
    ],
    z.toJSONSchema(outputSchema)
  );

  // Valid JSON alone is not enough: check its structure and requested values.
  assert.equal(typeof content, "string");
  const parsed = outputSchema.parse(JSON.parse(content));
  assert.deepEqual(parsed, {
    title: "Spotter Test Plan",
    exercise: { name: "Push Up", setsCount: 3 },
  });

  console.log("PASS: generated JSON matches the schema and requested values.");
  console.dir(parsed, { depth: null });
}

test("Groq manual check: batch tool calling and structured output", {
  skip: process.argv.includes("--live")
    ? false
    : "Manual only: run node test/groq-manual.test.js --live from backend/.",
}, async () => {
  try {
    // Import only for an explicit live run. This loads the normal env config,
    // so backend/.env must be configured. Skipped runs never load the provider.
    const {
      sendToolCallRequestToGroq,
      sendContentGenerationRequestToGroq,
    } = await import("../src/providers/ai/groq.provider.js");

    await checkToolCalling(sendToolCallRequestToGroq);
    await checkStructuredOutput(sendContentGenerationRequestToGroq);
  } catch (error) {
    // Do not dump raw SDK errors/headers or credentials.
    console.error("Groq manual check failed:", {
      message: error.message,
      code: error.code ?? null,
      statusCode: error.statusCode ?? null,
    });
    // node:test reports failure and sets a nonzero exit code automatically.
    throw new Error("Groq manual check failed; see the details above.");
  }
});
