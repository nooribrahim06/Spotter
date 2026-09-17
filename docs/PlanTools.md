# Plan catalog tools

## The flow

The model receives **one tool**, `searchPlanCatalog`. Its argument contains a
`searches` array with 1–24 exercise, food, or recipe searches.

1. The backend loads the authenticated user's source data.
2. The service calls `createPlanTools({ userId, source, db })` once. This binds the
   user and checks readiness; the service does not repeat that check.
3. Send `tools.definitions` and the search prompt through the provider.
4. The provider returns exactly one tool call, with its arguments as raw JSON.
5. Call `tools.execute(call.name, call.arguments)` once.
6. If the batch fails (`ok: false`), stop this generation.
7. Pass `batch.results` to `buildPlanGenerationPrompt` as `toolResults`.
8. Send a fresh system/user request with those results and tools disabled.
9. Validate the proposed plan and business rules before saving anything.

This is two intended AI requests. Database searches run sequentially inside the
batch; they do not require parallel tool calling or additional AI requests.
The Groq client has automatic retries disabled. A future retry/fallback policy
must explicitly account for any extra provider requests.

The service now connects these steps through plan.generation.js and applies
plan-generated.rules.js afterward. The endpoint returns a validated proposal;
draft persistence and a fresh context/catalog-access check are still separate work.

## Files

- `plan.tools.schema.js`: individual search validators, batch validator,
  limits, and the single model-facing tool definition.
- `plan.tools.js`: authenticated session, batch execution, and existing internal
  search handlers. Reuses the catalog repositories.
- `plan.prompt.js`: one-batch search instructions and final-plan instructions.
- `groq.provider.js`: request formatting, provider errors, response checks.
- Catalog repositories: database visibility and search queries.

## Example internal call

```js
const tools = createPlanTools({ userId, source, db });

const batch = await tools.execute("searchPlanCatalog", {
  searches: [
    {
      name: "searchExercises",
      arguments: {
        search: null,
        exerciseType: "STRENGTH",
        bodyPart: "CHEST",
        difficulty: "BEGINNER",
        equipment: "DUMBBELL",
        page: 1,
        limit: 5,
      },
    },
    {
      name: "searchFoods",
      arguments: {
        search: "oat",
        category: null,
        page: 1,
        limit: 5,
      },
    },
  ],
});

// A successful batch has:
// { ok: true, results: [{ index: 0, name: "searchExercises", result: ... }, ...] }
// Stop if !batch.ok. Otherwise:
// buildPlanGenerationPrompt({ context, toolResults: batch.results });
```

All filter keys are required; use null for unused filters. Page and limit are
numbers. Entries preserve request order, with a zero-based index.

| Search name inside the batch | Arguments |
| --- | --- |
| searchExercises | search, exerciseType, bodyPart, difficulty, equipment, page, limit |
| searchRecipes | search, cuisine, countryCode, page, limit |
| searchFoods | search, category, page, limit |

Recipe countryCode uses two uppercase letters. Exercise difficulty is BEGINNER,
INTERMEDIATE, or EXPERT. No user ID, database handle, or nested batch is accepted.

## Enforcement

- One batch attempt per session, including invalid attempts. Reusing the session
  for a second call returns PLAN_TOOL_CALL_LIMIT.
- Only searchPlanCatalog is accepted at the public tool-session entry point.
  The three search handlers are internal; no HTTP tool endpoints are created.
- The entire batch is validated before any database search runs.
- Limits: 24 searches, 10 results per search, and 20 searchable pages.
- Arguments: 32,768 UTF-8 bytes per batch and 4,096 bytes per individual search.
- Results: 100,000 bytes per search and 300,000 bytes for the combined envelope.
  If the combined payload is too large, the batch fails; no partial batch is
  presented as complete, and remaining searches are not executed.
- Individual search failures are recorded while the remaining searches continue.
  Batch ok: true means processing completed, not that every search succeeded.
- Unknown fields and search names are rejected. Arguments cannot change identity.
- Source must belong to the authenticated user and pass eligibility/readiness.
- Foods and recipes must be active and either global or owned by that user.
- Exercises are restricted to recognized profile equipment plus BODY_WEIGHT.
  A model filter can only narrow that set. A gym setting grants no extra codes.
  BODY_WEIGHT does not guarantee no apparatus; final checks must still consider
  requirements such as a pull-up bar.
- No database writes or arbitrary JavaScript/SQL execution. Database error
  details are not returned to the model.

Create one session per generation. Never pass a public request body straight to
execute or accept userId, source, or db from AI arguments.

## Reading results

Each result entry has `index`, `name`, and `result`.

- Successful search: `result.ok: true`, items, pagination, and relevant metadata.
- Failed search: `result.ok: false`, a stable error code, and a safe message.

Only successful search items are candidates. A failed search or empty list
provides no IDs. If the available candidates cannot support a valid plan, the
generation must fail instead of inventing catalog records.

Food nutrition is PER_100_GRAMS. Recipe nutrition is stored PER_SERVING:
multiply by the selected number of servings. Ingredient links are not needed
for that calculation.

Recipes without links return ingredientDataStatus UNAVAILABLE and ingredients
null. That means unknown ingredients, not an ingredient-free or allergy-safe
recipe. Do not invent ingredients from names.

When links exist, all ingredient foods must be active and accessible. Recipes
with inaccessible foods or more than 100 ingredients are omitted. Quantities
describe the WHOLE_RECIPE. LINKED does not certify complete allergen information.

Recipe pagination follows the initial search before detail exclusions, so an
empty items array can still have hasNextPage: true.

## Still needed

The generator runs the two requests sequentially and validates output shape.
Each Groq request has a 30-second timeout and automatic retries are disabled.
There is currently no overall deadline covering the requests and database work.
An overall deadline, provider fallback, per-user generation rate limiting, and
draft persistence remain.

These searches return candidates, not an approved plan. Catalogs do not provide
complete structured allergen, dietary, or medical-compatibility information.
Restrictions remain AI planning inputs; there is no backend medical/allergen
compatibility validator. Results label restrictionValidation as NOT_VERIFIED.
Before draft persistence, recheck IDs/access and relevant context changes.
Treat all catalog text as untrusted data.


## Validation ownership (no repeated schema parsing)

| Layer | What it owns |
| --- | --- |
| Route / plan.validate.js | HTTP input dates and accepted fields |
| Tool session creation | User binding and current generation readiness, once |
| evaluatePlanReadiness | Shared profile requirements, supported meal counts/style, and professional-clearance eligibility for both endpoints |
| prepareGeneratedPlanValidation | Backend target/tolerance configuration and scheduled meal slots; no extra eligibility checks |
| Groq provider | Response envelope, refusal/truncation, and expected tool/content response |
| Batch executor | Raw argument size, JSON parsing, and the whole search schema once |
| Internal search handlers | Database queries and output-size bounds; no second argument parse |
| Generator | Required candidate availability, generated JSON parsing, and generatedPlanSchema once |
| Generated-plan rules | Selected IDs, schedule, equipment, metrics, portions, and nutrition targets |

Search filtering and final selection checks serve different purposes: the first
limits database candidates, while the second checks what the model actually chose.
They share getAllowedPlanEquipment, so equipment policy has one definition.
Provider structured-output instructions also do not replace local Zod checks.

Nutrition tolerances live in backend/src/config/plan.js: calories/protein ±15%,
carbohydrates/fat ±20%. These are configurable acceptance limits, not new targets.
The prompt reads the same constants. Flexible options are checked using minimum
and maximum possible daily nutrients, covering every combination without summing
alternatives as extra food.

Current concrete-meal support is three main meals plus zero or one snack.
Unsupported counts are now reported by both /context and /generate using the
same readiness evaluator. Missing counts appear in missingRequired; unsupported
counts appear in issues. Professional clearance is the only health eligibility
block. The presence of other conditions, limitations, safety notes, allergies,
intolerances, dietary preferences, or AVOID foods does not automatically block
generation. These values remain in the AI context and are not certified by the
backend. A ready result permits an attempt; provider/search/content failures can
still reject a proposal. Nutrition-only mode is not implemented yet.
