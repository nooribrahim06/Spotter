# AI Tool Calling and Catalog Execution

## What it is

Tool calling is a controlled interaction in which a model selects a named capability and supplies structured arguments, while the application decides whether and how to execute it. The model does not receive database credentials and does not run JavaScript or SQL itself.

A conventional native function-calling loop looks like this:

```text
application sends tool declarations
        ↓
model returns a function name and arguments
        ↓
application validates and executes the function
        ↓
application returns the function result to the model
```

Spotter currently implements the same security boundary and application-owned execution, but its active Gemini path does **not** use Gemini native function calling. It asks for schema-constrained search JSON, converts that JSON into the existing internal tool-call shape, and executes it locally. Calling this flow “tool calling” describes the application architecture; “structured output” describes the current provider transport.

## How Spotter uses it

Plan generation uses a bounded two-request flow:

```text
Request 1: user context + search-batch schema
        ↓
Gemini returns structured search JSON
        ↓
Spotter validates the whole batch with Zod
        ↓
searchPlanCatalog executes approved repository searches
        ↓
Request 2: user context + real catalog results + plan schema
        ↓
Gemini returns the proposed weekly plan
        ↓
Spotter parses, validates, checks business rules, then may save it
```

[`plan.tools.schema.js`](../../../backend/src/modules/plans/plans-generation/plan.tools.schema.js) defines one model-facing capability named `searchPlanCatalog`. Its `searches` array can contain the internal operations `searchExercises`, `searchRecipes`, and `searchFoods`.

[`plan.tools.js`](../../../backend/src/modules/plans/plans-generation/plan.tools.js) creates a tool session bound to the authenticated user and authoritative plan source. It validates the complete batch before executing any query, dispatches only allowlisted operation names, applies server-owned access constraints, and limits argument and result sizes.

[`plan.generation.js`](../../../backend/src/modules/plans/plan.generation.js) coordinates the two stages. The first provider result is passed to `tools.execute(...)`; the second request receives only the catalog records returned by that execution.

[`gemini.provider.js`](../../../backend/src/providers/ai/gemini.provider.js) preserves an older adapter interface named `sendToolCallRequestToGroq`, but the implementation calls Gemini and uses `responseSchema`. The function name is compatibility debt, not evidence that the active request goes to Groq.

## Current execution contract

The provider adapter returns this internal shape:

```js
[
  {
    id: "gemini_...",
    name: "searchPlanCatalog",
    arguments: "{\"searches\":[...]}"
  }
]
```

The executor then applies these controls:

| Control | Current behavior |
| --- | --- |
| Available model-facing tools | Exactly one: `searchPlanCatalog` |
| Tool rounds | One attempted batch per generation |
| Searches per batch | 1–6 |
| Search names | Fixed allowlist of exercise, recipe, and food searches |
| Arguments | Parsed from JSON and validated by `searchPlanCatalogToolSchema` |
| Identity and permissions | Taken from authentication and backend context, never model arguments |
| Execution order | Sequential to avoid a database-connection burst |
| Result exposure | Explicit candidate fields only |
| Result trust | Catalog output is evidence for generation, not permission to save |

The local `id` maintains the older internal interface. It is not a provider-issued native function-call ID and is not sent back to Gemini in a function-response turn.

## Tool calling is not authorization

The model may propose filters and catalog searches, but Spotter owns every sensitive decision:

- The authenticated `userId` is captured when the tool session is created.
- Repository queries reapply visibility and equipment constraints.
- Unknown operation names and invalid nested arguments are rejected.
- Catalog text is treated as data, not instructions.
- Final IDs must come from the exact candidates returned to the model.
- Final plan rules and Zod validation still run before persistence.

This prevents a generated argument from becoming an unchecked database query or an authorization decision.

## Native function calling versus Spotter's current transport

| Concern | Native function calling | Current Spotter flow |
| --- | --- | --- |
| Provider request | Sends function declarations as tools | Sends their parameter schema as a structured-output schema |
| Provider response | Function-call part with name, arguments, and provider ID | JSON text matching the search-batch schema |
| Tool execution | Application-owned | Application-owned |
| Tool result returned as a provider function response | Usually yes | No; results are embedded as data in a fresh generation request |
| Current reason | Appropriate for iterative tool conversations | Avoids provider issues with the nested discriminated-union batch and keeps one bounded search round |

If Spotter later adopts native function calling, preserve the executor and its validation boundary. Only the provider adapter and conversation plumbing should need to change.

## Operational notes

- Never execute a tool name through dynamic imports or property access without an allowlist.
- Validate all calls before executing the first one; otherwise a partially invalid batch can still mutate or read data.
- Keep authentication, ownership, and server policy outside model-controlled arguments.
- Bound call count, argument bytes, result bytes, latency, and concurrency.
- Treat tool results as untrusted prompt data because database text can contain prompt-like content.
- Log tool names and operational outcomes, but avoid logging private profile data or full model payloads in production.
- A provider returning schema-valid arguments does not remove the need for application validation.

## Official references

- [Gemini tools overview](https://ai.google.dev/gemini-api/docs/tools)
- [Gemini function calling](https://ai.google.dev/gemini-api/docs/function-calling)
- [Groq local tool calling](https://console.groq.com/docs/tool-use/local-tool-calling)

