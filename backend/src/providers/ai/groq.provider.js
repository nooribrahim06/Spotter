// Translates Spotter's generic AI request format into Groq's format.
//
// This provider:
// - converts messages
// - converts tool definitions
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
 * Convert Spotter tool definitions into Groq function tools.
 */
function convertToolDefinitionsToGroqFormat(
  toolDefinitions
) {
  if (!Array.isArray(toolDefinitions)) {
    throw new TypeError(
      "toolDefinitions must be an array."
    );
  }

  return toolDefinitions.map((tool) => ({
    type: "function",

    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
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
 * Ask GPT-OSS for one tool call. For plan generation, the advertised tool
 * is a batch containing all catalog searches; the provider does not run them.
 *
 * Tools:
 * YES
 *
 * Structured output:
 * NO
 */
export async function sendToolCallRequestToGroq(
  messages,
  toolDefinitions
) {
  /*
   * Conversion happens outside the try.
   *
   * WHY:
   * If OUR code passes invalid messages/tool definitions,
   * that's a programming/configuration error.
   *
   * It should not be disguised as:
   * "Groq failed."
   */
  const groqMessages =
    convertMessagesToGroqFormat(messages);

  const groqTools =
    convertToolDefinitionsToGroqFormat(
      toolDefinitions
    );

  let response;

  try {
    response =
      await groq.chat.completions.create(
        {
          model: env.GROQ_MODEL_NAME,

          messages: groqMessages,

          tools: groqTools,

          /*
           * This stage exists specifically because we want
           * the model to request a catalog search.
           */
          tool_choice: "required",

          reasoning_effort: "low",
        },
        {
          timeout: REQUEST_TIMEOUT_MS,
        }
      );
  } catch (error) {
    throw translateGroqError(error);
  }


  /* -------------------------------------------------------
     From here downward Groq DID respond.

     So these are response/content problems,
     not network/provider transport problems.
  ------------------------------------------------------- */

  const choice = response?.choices?.[0];

  if (!choice) {
    throw new AIProviderInvalidResponseError(
      "The AI service returned no completion choice."
    );
  }


  if (choice.finish_reason === "length") {
    throw new AIProviderTruncatedResponseError(
      "The AI search response was incomplete."
    );
  }


  if (choice.message?.refusal) {
    throw new AIProviderRefusalError(
      "The AI service refused the catalog-search request."
    );
  }


  const toolCalls = choice.message?.tool_calls;

  // The selected model need only produce ONE function call. That call carries
  // the whole batch. Never execute an unexpected second top-level tool call.
  if (
    choice.finish_reason !== "tool_calls" ||
    choice.message?.role !== "assistant" ||
    !Array.isArray(toolCalls) ||
    toolCalls.length !== 1
  ) {
    throw new AIProviderInvalidResponseError(
      "The AI service must return exactly one completed tool call."
    );
  }


  return toolCalls.map((toolCall) => {
    /*
     * A valid function tool call must contain a function
     * object and function name.
     */
    if (
      toolCall?.type !== "function" ||
      typeof toolCall.id !== "string" ||
      toolCall.id.trim() === "" ||
      typeof toolCall.function?.name !== "string" ||
      !groqTools.some((tool) => tool.function.name === toolCall.function.name)
    ) {
      throw new AIProviderInvalidResponseError(
        "The AI service returned an invalid tool call."
      );
    }


    if (
      typeof toolCall.function.arguments !== "string"
    ) {
      throw new AIProviderInvalidResponseError(
        "The AI service returned invalid tool arguments."
      );
    }


    // Preserve the raw JSON. The tool executor checks its byte limit BEFORE
    // parsing and validates the entire batch against the search schemas.
    return {
      id: toolCall.id,
      name: toolCall.function.name,
      arguments: toolCall.function.arguments,
    };
  });
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
    response =
      await groq.chat.completions.create(
        {
          model: env.GROQ_MODEL_NAME,

          messages: groqMessages,

          response_format: responseFormat,

          reasoning_effort: "medium",
        },
        {
          timeout: REQUEST_TIMEOUT_MS,
        }
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
