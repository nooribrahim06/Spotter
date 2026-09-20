import assert from "node:assert/strict";
import { test } from "node:test";

Object.assign(process.env, {
  NODE_ENV: "test", DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  FRONTEND_URL: "http://localhost:5173", ACCESS_TOKEN_SECRET: Buffer.alloc(32, 1).toString("base64url"),
  EMAIL_USER: "test@example.com", EMAIL_APP_PASSWORD: "test",
  CLOUD_NAME: "test", CLOUD_API_KEY: "test", CLOUD_API_SECRET: "test",
  GROQ_API_KEY: "test", GROQ_API_KEY2: "test",
  GROQ_TOOL_MODEL: "test-tools", GROQ_GENERATION_MODEL: "test-content",
});
const { default: groq } = await import("../src/lib/groq.js");
const { env } = await import("../src/config/env.js");
const { sendToolCallRequestToGroq, sendContentGenerationRequestToGroq } =
  await import("../src/providers/ai/groq.provider.js");
const { getPlanToolDefinitions, searchPlanCatalogToolSchema } =
  await import("../src/modules/plans/plans-generation/plan.tools.schema.js");

const messages = [{ role: "user", content: "Generate a plan" }];
const args = { searches: [{ name: "searchFoods", arguments: { search: "rice", page: 1, limit: 3 } }] };
const toolResponse = { choices: [{ finish_reason: "stop", message: {
  role: "assistant", content: JSON.stringify(args),
} }] };
const malformed = () => Object.assign(new Error("Malformed tool JSON"), {
  status: 400, error: { error: { code: "tool_use_failed", failed_generation: "DO NOT EXECUTE" } },
});

test("Groq adapter recovery and content requests (no network)", async (t) => {
  await t.test("requests strict search JSON and preserves the executor contract", async (t) => {
    const calls = [];
    t.mock.method(groq.chat.completions, "create", (body) => {
      calls.push(body);
      assert.equal(body.tools, undefined);
      assert.equal(body.tool_choice, undefined);
      assert.equal(body.response_format.json_schema.strict, true);
      assert.deepEqual(body.response_format.json_schema.schema, getPlanToolDefinitions()[0].parameters);
      return { withResponse: async () => ({ data: toolResponse, response: { status: 200 } }) };
    });
    const result = await sendToolCallRequestToGroq(messages, getPlanToolDefinitions());
    assert.equal(calls.length, 1);
    assert.equal(calls[0].model, "test-tools");
    assert.equal(result[0].name, "searchPlanCatalog");
    assert.deepEqual(searchPlanCatalogToolSchema.parse(JSON.parse(result[0].arguments)), args);
  });

  for (const [choice, code] of [
    [{ finish_reason: "length" }, "AI_PROVIDER_TRUNCATED_RESPONSE"],
    [{ finish_reason: "stop", message: { refusal: "No" } }, "AI_PROVIDER_REFUSAL"],
    [{ finish_reason: "tool_calls", message: { role: "assistant", tool_calls: [] } }, "AI_PROVIDER_INVALID_RESPONSE"],
    [{ finish_reason: "stop", message: { role: "assistant", content: " " } }, "AI_PROVIDER_INVALID_RESPONSE"],
  ]) {
    await t.test(`rejects unusable search response: ${code}`, async (t) => {
      t.mock.method(groq.chat.completions, "create", () => ({ withResponse: async () => ({ data: { choices: [choice] } }) }));
      await assert.rejects(sendToolCallRequestToGroq(messages, getPlanToolDefinitions()), (e) => e.code === code);
    });
  }

  for (const [label, failure, expectedCalls, code] of [
    ["does not retry provider errors", malformed(), 1, "AI_PROVIDER_ERROR"],
    ["does not retry rate limits", Object.assign(new Error("limit"), { status: 429 }), 1, "AI_PROVIDER_RATE_LIMITED"],
    ["does not retry unrelated bad requests", Object.assign(new Error("invalid model"), { status: 400 }), 1, "AI_PROVIDER_ERROR"],
  ]) {
    await t.test(label, async (t) => {
      let calls = 0;
      t.mock.method(groq.chat.completions, "create", () => {
        calls++;
        return { withResponse: async () => { throw failure; } };
      });
      await assert.rejects(sendToolCallRequestToGroq(messages, getPlanToolDefinitions()), (e) => e.code === code && e.cause === failure);
      assert.equal(calls, expectedCalls);
    });
  }

  await t.test("content uses provided schema/model and logs the real request model", async (t) => {
    const schema = { type: "object", properties: {} };
    const logs = [];
    const previous = env.NODE_ENV;
    env.NODE_ENV = "development";
    t.after(() => { env.NODE_ENV = previous; });
    t.mock.method(console, "dir", (entry) => logs.push(entry));
    t.mock.method(groq.chat.completions, "create", (body) => {
      assert.equal(body.model, "test-content");
      assert.deepEqual(body.response_format.json_schema.schema, schema);
      return { withResponse: async () => ({ data: { choices: [{
        finish_reason: "stop", message: { role: "assistant", content: "{}" },
      }] }, response: { status: 200 } }) };
    });
    assert.equal(await sendContentGenerationRequestToGroq(messages, schema), "{}");
    assert.equal(logs[0].model, "test-content");
    assert.equal(logs[0].attempt, 1);
  });

  await t.test("content-stage tool errors are not retried", async (t) => {
    let calls = 0;
    t.mock.method(groq.chat.completions, "create", () => {
      calls++;
      return { withResponse: async () => { throw malformed(); } };
    });
    await assert.rejects(sendContentGenerationRequestToGroq(messages, { type: "object" }));
    assert.equal(calls, 1);
  });
});
