// Translates Spotter's generic AI request format into Groq's format.
//
// This provider:
// - converts messages
// - uses the search definition as a strict output schema
// - converts JSON Schema into Groq Structured Outputs format
// - sends requests through the shared Groq client
// - translates Groq/provider failures into Spotter AppErrors
// - checks basic provider response integrity
//
// It does NOT:
// - execute Spotter tools
// - validate the final plan with Zod
// - apply Spotter business rules
// - save plans

import { randomUUID } from "node:crypto";
import { APIConnectionTimeoutError, APIConnectionError } from "groq-sdk";
import groq from "../../lib/groq.js";
import { env } from "../../config/env.js";

import {
  AIProviderError,
  AIProviderRateLimitError,
  AIProviderTimeoutError,
  AIProviderUnavailableError,
  AIProviderInvalidResponseError,
  AIProviderRefusalError,
  AIProviderTruncatedResponseError,
} from "../../middlewares/errorHandling.js";

const REQUEST_TIMEOUT_MS = 30_000;

// Local diagnostics only: model output may contain private profile information.
// Log responses before validation so even unusable HTTP-200 output is visible.
export function displayGroqResponse(stage, { model, attempt, response, data, error, elapsedMs }) {
  if (env.NODE_ENV !== "development") return;

  const headers = response?.headers ?? error?.headers;
  const diagnosticHeaders = {};
  for (const [name, value] of headers?.entries?.() ?? Object.entries(headers ?? {})) {
    const key = name.toLowerCase();
    if (key.startsWith("x-ratelimit-") ||
        ["retry-after", "x-request-id", "request-id", "x-groq-id"].includes(key)) {
      diagnosticHeaders[key] = value;
    }
  }

  console.dir({
    provider: "Groq",
    stage,
    model,
    attempt,
    status: response?.status ?? error?.status ?? null,
    elapsedMs,
    headers: diagnosticHeaders,
    response: data ?? null,
    error: error ? {
      name: error.name,
      message: error.message,
      code: error.code,
      body: error.error,
      cause: error.cause?.message,
    } : null,
  }, { depth: null, maxArrayLength: null, maxStringLength: null, colors: false });
}

async function requestGroq(stage, body, options) {
  const startedAt = Date.now();
  try {
    const { data, response } = await groq.chat.completions.create(body, options).withResponse();
    displayGroqResponse(stage, { model: body.model, attempt: 1, data, response, elapsedMs: Date.now() - startedAt });
    return data;
  } catch (error) {
    displayGroqResponse(stage, { model: body.model, attempt: 1, error, elapsedMs: Date.now() - startedAt });
    throw error;
  }
}


/* =========================================================
   FORMAT CONVERSION
========================================================= */

/**
 * Convert Spotter messages into Groq chat messages.
 * Both stages use fresh system/user messages. The generation prompt embeds
 * backend search results as JSON, so assistant/tool history is not needed.
 */
function convertMessagesToGroqFormat(messages) {
  if (!Array.isArray(messages)) {
    throw new TypeError("messages must be an array.");
  }

  return messages.map((message) => {
    if (
      message?.role !== "system" &&
      message?.role !== "user"
    ) {
      throw new TypeError(
        `Unsupported message role: ${message?.role}`
      );
    }

    if (typeof message.content !== "string") {
      throw new TypeError(
        "Message content must be a string."
      );
    }

    return {
      role: message.role,
      content: message.content,
    };
  });
}


/**
 * Convert an already-complete JSON Schema into
 * Groq's Structured Outputs wrapper.
 */
function convertOutputSchemaToGroqFormat(
  outputSchema
) {
  if (
    !outputSchema ||
    typeof outputSchema !== "object" ||
    Array.isArray(outputSchema)
  ) {
    throw new TypeError(
      "outputSchema must be a JSON Schema object."
    );
  }

  return {
    type: "json_schema",

    json_schema: {
      name: "generated_plan",
      strict: true,
      schema: outputSchema,
    },
  };
}


/* =========================================================
   PROVIDER ERROR TRANSLATION
========================================================= */

/**
 * Attach the original provider error for internal debugging
 * without exposing it through the public API response.
 */
function withCause(appError, cause) {
  appError.cause = cause;
  return appError;
}


/**
 * Translate Groq/SDK failures into Spotter's provider errors.
 *
 * This function is only for failures while CALLING Groq.
 *
 * It does not handle:
 * - refusal
 * - truncated model output
 * - missing content
 * - malformed tool calls
 *
 * Those mean Groq answered successfully at the HTTP level,
 * but the returned model response was unusable.
 */
function translateGroqError(error) {
  const status =
    typeof error?.status === "number"
      ? error.status
      : null;

  /*
   * Rate limit.
   */
  if (status === 429) {
    return withCause(
      new AIProviderRateLimitError(),
      error
    );
  }

  /*
   * Timeout.
   *
   * Depending on where the timeout occurred, it may appear
   * as an SDK timeout error, AbortError, ETIMEDOUT, or an
   * HTTP timeout status.
   */
  if (
    status === 408 ||
    status === 504 ||
    error instanceof APIConnectionTimeoutError ||
    error?.name === "AbortError" ||
    error?.code === "ETIMEDOUT"
  ) {
    return withCause(
      new AIProviderTimeoutError(),
      error
    );
  }

  /*
   * Groq server / connection unavailable.
   */
  if (
    (status !== null && status >= 500) ||
    error instanceof APIConnectionError ||
    error?.code === "ECONNRESET" ||
    error?.code === "ECONNREFUSED"
  ) {
    return withCause(
      new AIProviderUnavailableError(),
      error
    );
  }

  /*
   * Any other provider/API failure.
   *
   * Example:
   * Groq rejects our request because our provider adapter
   * sent unsupported parameters or an invalid schema.
   *
   * We intentionally do NOT expose Groq's raw message.
   */
  return withCause(
    new AIProviderError(),
    error
  );
}


/* =========================================================
   REQUEST 1 — TOOL REQUEST
========================================================= */

/**
 * Request a strict JSON search batch, not a native Groq tool call.
 * Preserve the executor's existing call shape; it still bounds and validates
 * the raw JSON before running any search. The local ID is not a provider tool ID.
 */
export async function sendToolCallRequestToGroq(messages, toolDefinitions) {
  const groqMessages = convertMessagesToGroqFormat(messages);
  if (!Array.isArray(toolDefinitions) || toolDefinitions.length !== 1) {
    throw new TypeError("Search generation requires exactly one batch definition.");
  }
  const definition = toolDefinitions[0];
  const responseFormat = convertOutputSchemaToGroqFormat(definition.parameters);
  responseFormat.json_schema.name = "catalog_search_batch";

  let response;
  try {
    response = await requestGroq("1: catalog search JSON", {
      model: env.GROQ_TOOL_MODEL,
      messages: groqMessages,
      response_format: responseFormat,
      reasoning_effort: "low",
    }, { timeout: REQUEST_TIMEOUT_MS });
  } catch (error) {
    throw translateGroqError(error);
  }

  const choice = response?.choices?.[0];
  if (choice?.finish_reason === "length") throw new AIProviderTruncatedResponseError();
  if (choice?.message?.refusal) throw new AIProviderRefusalError();
  if (choice?.finish_reason !== "stop" || choice.message?.role !== "assistant" ||
      (choice.message.tool_calls != null &&
        (!Array.isArray(choice.message.tool_calls) || choice.message.tool_calls.length > 0)) ||
      typeof choice.message.content !== "string" || !choice.message.content.trim()) {
    throw new AIProviderInvalidResponseError("The AI service returned no completed search JSON.");
  }
  return [{ id: randomUUID(), name: definition.name, arguments: choice.message.content }];
}


/* =========================================================
   REQUEST 2 — STRUCTURED PLAN GENERATION
========================================================= */

/**
 * Generate the actual weekly plan.
 *
 * Tools:
 * NO
 *
 * Structured output:
 * YES
 */
export async function sendContentGenerationRequestToGroq(
  messages,
  outputSchema
) {
  /*
   * Again, conversion is outside the provider try/catch.
   *
   * A broken Spotter schema is our bug/config problem,
   * not a Groq availability failure.
   */
  const groqMessages =
    convertMessagesToGroqFormat(messages);

  const responseFormat =
    convertOutputSchemaToGroqFormat(
      outputSchema
    );
  let response;

  try {
    response = await requestGroq(
      "2: plan content generation",
      {
        model: env.GROQ_GENERATION_MODEL,
        messages: groqMessages,
        response_format: responseFormat,
        reasoning_effort: "low",
        max_completion_tokens: 6000,
      },
      { timeout: REQUEST_TIMEOUT_MS }
    );
  } catch (error) {
    throw translateGroqError(error);
  }


  /* -------------------------------------------------------
     Groq responded successfully.
     Now validate the basic shape of its response.
  ------------------------------------------------------- */

  const choice = response?.choices?.[0];

  if (!choice) {
    throw new AIProviderInvalidResponseError(
      "The AI service returned no completion choice."
    );
  }


  if (choice.finish_reason === "length") {
    throw new AIProviderTruncatedResponseError(
      "The generated plan response was incomplete."
    );
  }


  if (choice.message?.refusal) {
    throw new AIProviderRefusalError(
      "The AI service refused plan generation."
    );
  }


  if (
    choice.finish_reason !== "stop" ||
    choice.message?.role !== "assistant" ||
    (choice.message.tool_calls != null &&
      (!Array.isArray(choice.message.tool_calls) ||
        choice.message.tool_calls.length > 0))
  ) {
    throw new AIProviderInvalidResponseError(
      "The AI service did not return a completed content-only response."
    );
  }

  const content = choice.message?.content;

  if (
    typeof content !== "string" ||
    content.trim() === ""
  ) {
    throw new AIProviderInvalidResponseError(
      "The AI service returned no generated plan content."
    );
  }


  return content;
}
