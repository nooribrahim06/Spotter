# Structured Outputs and JSON Schema

## What it is

Structured output constrains an AI response to a machine-readable shape instead of accepting arbitrary prose. Spotter describes that shape with Zod, converts it to JSON Schema, supplies a provider-compatible version of the schema with the AI request, then validates the returned value again with Zod.

These layers have different responsibilities:

| Layer | Responsibility |
| --- | --- |
| Zod schema | Runtime source of truth inside Spotter |
| JSON Schema | Portable description sent toward the AI provider |
| Provider structured-output mode | Guides or constrains generation to the supported schema subset |
| `JSON.parse()` | Converts returned JSON text into a JavaScript value |
| Zod `safeParse()` | Re-establishes trust at the application boundary |
| Business rules | Check facts and relationships that a shape schema cannot prove |

Schema-conforming output is not automatically factually correct, authorized, medically safe, or consistent with the database.

## How Spotter uses it

Spotter uses structured outputs for both AI requests in plan generation.

### Search-batch output

[`plan.tools.schema.js`](../../../backend/src/modules/plans/plans-generation/plan.tools.schema.js) defines strict Zod schemas for exercise, recipe, and food searches. It converts the outer batch to JSON Schema:

```js
parameters: z.toJSONSchema(searchPlanCatalogToolSchema)
```

The active Gemini adapter converts that general JSON Schema to Gemini's supported subset and sends it as:

```js
config: {
  responseMimeType: "application/json",
  responseSchema: geminiSchema,
}
```

The returned JSON string is not executed immediately. [`plan.tools.js`](../../../backend/src/modules/plans/plans-generation/plan.tools.js) parses it and validates it again with `searchPlanCatalogToolSchema.safeParse(...)` before any repository query runs.

### Generated-plan output

[`plan.prompt.js`](../../../backend/src/modules/plans/plans-generation/plan.prompt.js) converts `generatedPlanSchema` to JSON Schema and returns it beside the generation prompt:

```js
responseSchema: z.toJSONSchema(generatedPlanSchema)
```

The provider uses that schema for the second AI request. [`plan.generation.js`](../../../backend/src/modules/plans/plan.generation.js) then bounds the response size, parses the JSON, and performs the authoritative runtime check:

```js
const parsedPlan = JSON.parse(generatedContent);
const result = generatedPlanSchema.safeParse(parsedPlan);
```

After structural validation, separate final rules confirm catalog provenance, schedule constraints, equipment compatibility, tracking metrics, and recalculated nutrition.

## Provider translation

JSON Schema support differs between providers and models. Spotter therefore keeps provider-specific conversion in the adapter rather than weakening its application schemas.

[`gemini.provider.js`](../../../backend/src/providers/ai/gemini.provider.js) recursively converts the Zod-produced JSON Schema into the subset accepted by Gemini. It handles schema definitions and references, removes unsupported keywords, and preserves supported constraints such as types, properties, required keys, enums, item schemas, and selected numeric or array bounds.

[`groq.provider.js`](../../../backend/src/providers/ai/groq.provider.js) contains the alternative Groq representation:

```js
response_format: {
  type: "json_schema",
  json_schema: {
    name: "generated_plan",
    strict: true,
    schema: outputSchema,
  },
}
```

The active plan-generation import currently points to the Gemini provider. The Groq adapter remains an implementation alternative, not a second provider call in the same generation.

## Why validation still happens after generation

Spotter must not trust provider output merely because structured-output mode was enabled:

1. Providers support different JSON Schema subsets.
2. Adapter conversion can intentionally omit unsupported keywords.
3. A supported model or provider configuration can change.
4. JSON syntax can be valid while domain relationships are wrong.
5. Zod refinements such as `superRefine` are not fully expressible in provider schemas.
6. A valid catalog ID can still be unauthorized or absent from this generation's evidence.

The safe boundary is therefore:

```text
provider schema constraint
        ↓
size limit
        ↓
JSON.parse
        ↓
Zod safeParse
        ↓
server-owned business rules
        ↓
persistence
```

## Schema design rules used by Spotter

- Objects are strict so unexpected keys are rejected.
- Required keys are explicit; nullable fields use `null` instead of being silently omitted where the provider contract requires a stable shape.
- Enums constrain model choices to application vocabulary.
- Arrays and strings have size limits to control payload growth.
- Search operations use a discriminated union keyed by `name`.
- Descriptions explain field semantics to the model but do not enforce authorization.
- The same Zod schemas are reused for provider schema generation and backend validation to reduce contract drift.

## Structured output is not tool calling

Structured output answers “what shape must the model return?” Tool calling answers “does the model want the application to perform a named operation?” They can be combined, but they are not interchangeable.

Spotter currently uses structured output to represent the requested catalog-search batch. The backend then adapts that batch to its local tool executor. The final plan is also structured output, but it is not a tool call because it requests no application action.

## Operational notes

- Keep provider conversion functions covered by tests when schemas evolve.
- A provider rejection caused by an unsupported schema is an integration/configuration error, not bad user input.
- Detect refusal, truncation, missing candidates, and missing content before parsing.
- Keep response byte limits in addition to schema item limits.
- Never persist directly from `JSON.parse()` output.
- Recalculate authoritative numeric values such as nutrition instead of accepting model claims.
- Check the selected model's current structured-output support before changing schemas or models.

## Official references

- [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output)
- [Gemini tools: structured outputs versus function calling](https://ai.google.dev/gemini-api/docs/tools#structured-outputs-vs-function-calling)
- [Groq structured outputs](https://console.groq.com/docs/structured-outputs)
- [Zod JSON Schema conversion](https://zod.dev/json-schema)

