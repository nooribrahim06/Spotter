import { GoogleGenAI } from "@google/genai";

import {
  AIProviderError,
  AIProviderRateLimitError,
  AIProviderTimeoutError,
  AIProviderUnavailableError,
  AIProviderInvalidResponseError,
  AIProviderRefusalError,
  AIProviderTruncatedResponseError,
} from "../../middlewares/errorHandling.js";

/*
|--------------------------------------------------------------------------
| CONFIG
|--------------------------------------------------------------------------
|
| We intentionally use process.env directly here so you DON'T have to edit
| your existing env.js/config layer just to migrate providers.
|
*/

const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim();

const GEMINI_MODEL =
  process.env.GEMINI_MODEL?.trim() ||
  "gemini-2.5-flash";

const REQUEST_TIMEOUT_MS = 30_000;

if (!GEMINI_API_KEY) {
  throw new Error(
    "GEMINI_API_KEY is required to use the Gemini provider."
  );
}

const gemini = new GoogleGenAI({
  apiKey: GEMINI_API_KEY,
});


/*
|--------------------------------------------------------------------------
| LOGGING
|--------------------------------------------------------------------------
|
| Keeping the OLD FUNCTION NAME intentionally.
| If anything else imports displayGroqResponse, it will still work.
|
*/

export function displayGroqResponse(
  stage,
  {
    response = null,
    error = null,
    elapsedMs = null,
    attempt = 1,
  } = {}
) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.dir(
    {
      provider: "Gemini",

      stage,

      model:
        response?.model ??
        GEMINI_MODEL,

      attempt,

      status:
        error
          ? error?.status ??
            error?.statusCode ??
            null
          : 200,

      elapsedMs,

      response,

      error: error
        ? {
            name: error?.name,
            message: error?.message,
            code:
              error?.code ??
              error?.error?.code ??
              null,
            status:
              error?.status ??
              error?.statusCode ??
              null,
            body:
              error?.error ??
              error?.response?.data ??
              null,
            cause:
              error?.cause?.message ??
              null,
          }
        : null,
    },
    {
      depth: null,
      colors: false,
      maxArrayLength: null,
      maxStringLength: null,
    }
  );
}


/*
|--------------------------------------------------------------------------
| REQUEST TIMEOUT
|--------------------------------------------------------------------------
*/

function createTimeoutError() {
  const error = new Error(
    "Gemini request timed out."
  );

  error.name = "TimeoutError";

  return error;
}

async function withTimeout(promise) {
  let timer;

  try {
    const timeoutPromise = new Promise(
      (_, reject) => {
        timer = setTimeout(
          () => reject(createTimeoutError()),
          REQUEST_TIMEOUT_MS
        );
      }
    );

    return await Promise.race([
      promise,
      timeoutPromise,
    ]);
  } finally {
    clearTimeout(timer);
  }
}


/*
|--------------------------------------------------------------------------
| PROVIDER REQUEST WRAPPER
|--------------------------------------------------------------------------
*/

async function requestGemini(
  stage,
  body,
  attempt = 1
) {
  const startedAt = Date.now();

  try {
    const response = await withTimeout(
      gemini.models.generateContent(body)
    );

    displayGroqResponse(stage, {
      response,
      attempt,
      elapsedMs:
        Date.now() - startedAt,
    });

    return response;
  } catch (error) {
    displayGroqResponse(stage, {
      error,
      attempt,
      elapsedMs:
        Date.now() - startedAt,
    });

    throw error;
  }
}


/*
|--------------------------------------------------------------------------
| MESSAGE CONVERSION
|--------------------------------------------------------------------------
|
| Your existing code sends:
|
| [
|   { role: "system", content: "..." },
|   { role: "user", content: "..." }
| ]
|
| Gemini separates system_instruction from contents.
|
*/

function convertMessagesToGeminiFormat(
  messages
) {
  if (!Array.isArray(messages)) {
    throw new TypeError(
      "messages must be an array."
    );
  }

  const systemMessages = [];
  const userMessages = [];

  for (const message of messages) {
    if (
      message?.role !== "system" &&
      message?.role !== "user"
    ) {
      throw new TypeError(
        `Unsupported message role: ${message?.role}`
      );
    }

    if (
      typeof message.content !== "string"
    ) {
      throw new TypeError(
        "Message content must be a string."
      );
    }

    if (message.role === "system") {
      systemMessages.push(
        message.content
      );
    } else {
      userMessages.push(
        message.content
      );
    }
  }

  if (userMessages.length === 0) {
    throw new TypeError(
      "At least one user message is required."
    );
  }

  return {
    systemInstruction:
      systemMessages.length > 0
        ? systemMessages.join("\n\n")
        : undefined,

    contents:
      userMessages.join("\n\n"),
  };
}


/*
|--------------------------------------------------------------------------
| JSON SCHEMA → GEMINI SCHEMA
|--------------------------------------------------------------------------
|
| You already generate schemas using:
|
| z.toJSONSchema(...)
|
| Gemini supports a subset of JSON Schema.
|
| Your Zod schema STILL performs the authoritative validation after Gemini.
| This function only removes JSON-Schema keywords Gemini does not support.
|
*/

function convertJsonSchemaToGemini(
  schema
) {
  if (
    !schema ||
    typeof schema !== "object" ||
    Array.isArray(schema)
  ) {
    throw new TypeError(
      "Expected a JSON Schema object."
    );
  }

  const supportedFormats = new Set([
    "date",
    "date-time",
    "time",
  ]);

  function convert(node) {
    if (node === null) {
      return null;
    }

    if (Array.isArray(node)) {
      return node.map(convert);
    }

    if (typeof node !== "object") {
      return node;
    }

    const output = {};

    /*
    |--------------------------------------------------------------------------
    | References / definitions
    |--------------------------------------------------------------------------
    */

    if (node.$id !== undefined) {
      output.$id = node.$id;
    }

    if (node.$anchor !== undefined) {
      output.$anchor =
        node.$anchor;
    }

    if (node.$ref !== undefined) {
      output.$ref = node.$ref;
    }

    if (
      node.$defs &&
      typeof node.$defs === "object"
    ) {
      output.$defs = {};

      for (
        const [name, definition]
        of Object.entries(node.$defs)
      ) {
        output.$defs[name] =
          convert(definition);
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Basic metadata
    |--------------------------------------------------------------------------
    */

    if (node.title !== undefined) {
      output.title = node.title;
    }

    if (
      node.description !== undefined
    ) {
      output.description =
        node.description;
    }

    /*
    |--------------------------------------------------------------------------
    | TYPE
    |--------------------------------------------------------------------------
    */

    if (node.type !== undefined) {
      output.type = Array.isArray(
        node.type
      )
        ? [...node.type]
        : node.type;
    }

    /*
    |--------------------------------------------------------------------------
    | CONST
    |--------------------------------------------------------------------------
    |
    | Gemini supports enum.
    | Zod may emit const for discriminated unions.
    |
    */

    if (node.const !== undefined) {
      output.enum = [
        node.const,
      ];
    } else if (
      Array.isArray(node.enum)
    ) {
      output.enum = [
        ...node.enum,
      ];
    }

    /*
    |--------------------------------------------------------------------------
    | FORMAT
    |--------------------------------------------------------------------------
    |
    | UUID is deliberately removed.
    |
    | Your actual Zod schema still does:
    |
    | z.string().uuid()
    |
    | after Gemini responds.
    |
    */

    if (
      typeof node.format === "string" &&
      supportedFormats.has(
        node.format
      )
    ) {
      output.format =
        node.format;
    }

    /*
    |--------------------------------------------------------------------------
    | OBJECT
    |--------------------------------------------------------------------------
    */

    if (
      node.properties &&
      typeof node.properties ===
        "object"
    ) {
      output.properties = {};

      for (
        const [key, value]
        of Object.entries(
          node.properties
        )
      ) {
        output.properties[key] =
          convert(value);
      }
    }

    if (
      Array.isArray(node.required)
    ) {
      output.required = [
        ...node.required,
      ];
    }

    /*
    | additionalProperties is NOT supported by Gemini.
    | Your local Zod validation still enforces it.
    */

    /*
    |--------------------------------------------------------------------------
    | ARRAY
    |--------------------------------------------------------------------------
    */

    if (node.items !== undefined) {
      output.items =
        convert(node.items);
    }

    if (
      Array.isArray(
        node.prefixItems
      )
    ) {
      output.prefixItems =
        node.prefixItems.map(
          convert
        );
    }

    if (
      typeof node.minItems ===
      "number"
    ) {
      output.minItems =
        node.minItems;
    }

    if (
      typeof node.maxItems ===
      "number"
    ) {
      output.maxItems =
        node.maxItems;
    }

    /*
    |--------------------------------------------------------------------------
    | NUMBER
    |--------------------------------------------------------------------------
    */

    if (
      typeof node.minimum ===
      "number"
    ) {
      output.minimum =
        node.minimum;
    }

    if (
      typeof node.maximum ===
      "number"
    ) {
      output.maximum =
        node.maximum;
    }

    /*
    |--------------------------------------------------------------------------
    | UNION
    |--------------------------------------------------------------------------
    */

    if (
      Array.isArray(node.anyOf)
    ) {
      output.anyOf =
        node.anyOf.map(convert);
    }

    if (
      Array.isArray(node.oneOf)
    ) {
      output.oneOf =
        node.oneOf.map(convert);
    }

    /*
    |--------------------------------------------------------------------------
    | Intentionally NOT copying:
    |--------------------------------------------------------------------------
    |
    | minLength
    | maxLength
    | pattern
    | exclusiveMinimum
    | exclusiveMaximum
    | multipleOf
    | allOf
    | not
    |
    | Your local Zod validation remains responsible for these.
    |
    */

    return output;
  }

  return convert(schema);
}


/*
|--------------------------------------------------------------------------
| TOOL CONVERSION
|--------------------------------------------------------------------------
|
| Your existing tool definition:
|
| {
|   name,
|   description,
|   parameters
| }
|
| Gemini function declaration:
|
| {
|   name,
|   description,
|   parameters
| }
|
*/

function convertToolDefinitionsToGemini(
  toolDefinitions
) {
  if (
    !Array.isArray(
      toolDefinitions
    )
  ) {
    throw new TypeError(
      "toolDefinitions must be an array."
    );
  }

  return toolDefinitions.map(
    (tool) => {
      if (
        typeof tool?.name !==
          "string" ||
        tool.name.trim() === ""
      ) {
        throw new TypeError(
          "Every tool must have a valid name."
        );
      }

      return {
        name:
          tool.name,

        description:
          tool.description,

        parameters:
          convertJsonSchemaToGemini(
            tool.parameters
          ),
      };
    }
  );
}


/*
|--------------------------------------------------------------------------
| ERROR TRANSLATION
|--------------------------------------------------------------------------
*/

function withCause(
  appError,
  cause
) {
  appError.cause = cause;

  return appError;
}

function getStatus(error) {
  if (
    typeof error?.status ===
    "number"
  ) {
    return error.status;
  }

  if (
    typeof error?.statusCode ===
    "number"
  ) {
    return error.statusCode;
  }

  return null;
}

function getErrorCode(error) {
  return (
    error?.error?.code ??
    error?.code ??
    error?.response?.data
      ?.error?.code ??
    null
  );
}

function translateGeminiError(
  error
) {
  const status =
    getStatus(error);

  const code =
    getErrorCode(error);

  /*
  |--------------------------------------------------------------------------
  | RATE LIMIT
  |--------------------------------------------------------------------------
  */

  if (status === 429) {
    return withCause(
      new AIProviderRateLimitError(),
      error
    );
  }

  /*
  |--------------------------------------------------------------------------
  | TIMEOUT
  |--------------------------------------------------------------------------
  */

  if (
    status === 408 ||
    status === 504 ||
    error?.name ===
      "TimeoutError" ||
    error?.name ===
      "AbortError" ||
    error?.code ===
      "ETIMEDOUT"
  ) {
    return withCause(
      new AIProviderTimeoutError(),
      error
    );
  }

  /*
  |--------------------------------------------------------------------------
  | SAFETY / REFUSAL
  |--------------------------------------------------------------------------
  */

  const refusalCodes =
    new Set([
      "SAFETY",
      "PROHIBITED_CONTENT",
      "BLOCKLIST",
      "RECITATION",
      "SPII",
    ]);

  if (
    typeof code === "string" &&
    refusalCodes.has(
      code.toUpperCase()
    )
  ) {
    return withCause(
      new AIProviderRefusalError(
        "The AI service refused the request."
      ),
      error
    );
  }

  /*
  |--------------------------------------------------------------------------
  | PROVIDER UNAVAILABLE
  |--------------------------------------------------------------------------
  */

  if (
    (
      status !== null &&
      status >= 500
    ) ||
    error?.code ===
      "ECONNRESET" ||
    error?.code ===
      "ECONNREFUSED" ||
    error?.code ===
      "ENOTFOUND"
  ) {
    return withCause(
      new AIProviderUnavailableError(),
      error
    );
  }

  /*
  |--------------------------------------------------------------------------
  | EVERYTHING ELSE
  |--------------------------------------------------------------------------
  */

  return withCause(
    new AIProviderError(),
    error
  );
}


/*
|--------------------------------------------------------------------------
| STAGE 1
|--------------------------------------------------------------------------
|
| OLD NAME IS INTENTIONAL.
|
| Your plan.generation.js can keep calling:
|
| sendToolCallRequestToGroq(...)
|
| Return value remains:
|
| [
|   {
|     id,
|     name,
|     arguments: JSON_STRING
|   }
| ]
|
*/

export async function sendToolCallRequestToGroq(
  messages,
  toolDefinitions
) {
  /*
  |--------------------------------------------------------------------------
  | Convert before try/catch.
  |--------------------------------------------------------------------------
  |
  | If Spotter passes invalid internal data, that is OUR bug,
  | not a Gemini provider failure.
  |
  */

  const {
    systemInstruction,
    contents,
  } =
    convertMessagesToGeminiFormat(
      messages
    );

  /*
  |--------------------------------------------------------------------------
  | Use structured JSON output, not Gemini function calling.
  |--------------------------------------------------------------------------
  |
  | Gemini's function calling doesn't handle complex discriminated unions
  | well (it flattens nested objects to strings). The old Groq provider
  | also used structured output here, not native tool calling.
  |
  | We take the tool's parameters schema (already a JSON Schema from Zod)
  | and use it as Gemini's responseSchema.
  |
  */

  if (!Array.isArray(toolDefinitions) || toolDefinitions.length !== 1) {
    throw new TypeError("Search generation requires exactly one batch definition.");
  }

  const definition = toolDefinitions[0];

  const geminiSchema =
    convertJsonSchemaToGemini(
      definition.parameters
    );

  let response;

  try {
    response =
      await requestGemini(
        "1: catalog search JSON",
        {
          model:
            GEMINI_MODEL,

          systemInstruction,

          contents,

          config: {
            responseMimeType:
              "application/json",

            responseSchema:
              geminiSchema,

            thinkingConfig: {
              thinkingBudget: 1024,
            },

            maxOutputTokens:
              4096,
          },
        }
      );
  } catch (error) {
    throw translateGeminiError(
      error
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Extract from candidates
  |--------------------------------------------------------------------------
  */

  const candidates = response?.candidates ?? [];
  const candidate = candidates[0];

  if (!candidate) {
    throw new AIProviderInvalidResponseError(
      "The AI service returned no response candidates."
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Check finish reason
  |--------------------------------------------------------------------------
  */

  const finishReason = candidate.finishReason;

  if (finishReason === "MAX_TOKENS") {
    throw new AIProviderTruncatedResponseError(
      "The AI search response was incomplete."
    );
  }

  if (finishReason === "SAFETY" || finishReason === "BLOCKLIST" || finishReason === "PROHIBITED_CONTENT" || finishReason === "SPII" || finishReason === "RECITATION") {
    throw new AIProviderRefusalError(
      "The AI service refused the request."
    );
  }

  if (finishReason !== "STOP" && finishReason !== undefined) {
    throw new AIProviderInvalidResponseError(
      "The AI service did not complete the catalog-search request."
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Extract text content
  |--------------------------------------------------------------------------
  */

  const parts = candidate.content?.parts ?? [];
  const textPart = parts.find((part) => typeof part.text === "string");
  const content = textPart?.text;

  if (
    typeof content !== "string" ||
    content.trim() === ""
  ) {
    throw new AIProviderInvalidResponseError(
      "The AI service returned no completed search JSON."
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Keep your old return shape EXACTLY
  |--------------------------------------------------------------------------
  |
  | The executor expects:
  | [{ id, name, arguments: JSON_STRING }]
  |
  | content is already a JSON string from Gemini's structured output.
  |
  */

  return [
    {
      id:
        `gemini_${Date.now()}`,

      name:
        definition.name,

      arguments:
        content,
    },
  ];
}


/*
|--------------------------------------------------------------------------
| STAGE 2
|--------------------------------------------------------------------------
|
| OLD NAME IS INTENTIONAL.
|
| Your existing plan.generation.js can keep calling:
|
| sendContentGenerationRequestToGroq(...)
|
| Return value remains:
|
| JSON STRING
|
| Your existing code still does:
|
| JSON.parse(generatedContent)
| generatedPlanSchema.safeParse(...)
|
*/

export async function sendContentGenerationRequestToGroq(
  messages,
  outputSchema
) {
  const {
    systemInstruction,
    contents,
  } =
    convertMessagesToGeminiFormat(
      messages
    );

  const geminiSchema =
    convertJsonSchemaToGemini(
      outputSchema
    );

  let response;

  try {
    response =
      await requestGemini(
        "2: plan content generation",
        {
          model:
            GEMINI_MODEL,

          systemInstruction,

          contents,

          config: {
            responseMimeType:
              "application/json",

            responseSchema:
              geminiSchema,

            thinkingConfig: {
              thinkingBudget: 4096,
            },

            /*
            |--------------------------------------------------------------------------
            | Plenty of space for your full 7-day plan.
            |--------------------------------------------------------------------------
            */

            maxOutputTokens:
              16_000,
          },
        }
      );
  } catch (error) {
    throw translateGeminiError(
      error
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Extract from candidates
  |--------------------------------------------------------------------------
  */

  const candidates = response?.candidates ?? [];
  const candidate = candidates[0];

  if (!candidate) {
    throw new AIProviderInvalidResponseError(
      "The AI service returned no response candidates."
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Check finish reason
  |--------------------------------------------------------------------------
  */

  const finishReason = candidate.finishReason;

  if (finishReason === "MAX_TOKENS") {
    throw new AIProviderTruncatedResponseError(
      "The generated plan response was incomplete."
    );
  }

  if (finishReason === "SAFETY" || finishReason === "BLOCKLIST" || finishReason === "PROHIBITED_CONTENT" || finishReason === "SPII" || finishReason === "RECITATION") {
    throw new AIProviderRefusalError(
      "The AI service refused plan generation."
    );
  }

  if (finishReason !== "STOP" && finishReason !== undefined) {
    throw new AIProviderInvalidResponseError(
      "The AI service did not complete plan generation."
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Extract text content
  |--------------------------------------------------------------------------
  */

  const parts = candidate.content?.parts ?? [];
  const textPart = parts.find((part) => typeof part.text === "string");
  const content = textPart?.text;

  if (
    typeof content !==
      "string" ||
    content.trim() === ""
  ) {
    throw new AIProviderInvalidResponseError(
      "The AI service returned no generated plan content."
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Don't JSON.parse here.
  |--------------------------------------------------------------------------
  |
  | Your existing plan.generation.js already owns:
  |
  | JSON.parse(...)
  | generatedPlanSchema.safeParse(...)
  |
  | Keep that separation.
  |
  */

  return content;
}
