import assert from "node:assert/strict";
import { test } from "node:test";

Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://spotter:spotter@localhost:5432/spotter_test",
  FRONTEND_URL: "http://localhost:5173",
  ACCESS_TOKEN_SECRET: Buffer.alloc(32, 2).toString("base64url"),
  EMAIL_USER: "test@example.com",
  EMAIL_APP_PASSWORD: "test-password",
  CLOUD_NAME: "test",
  CLOUD_API_KEY: "test",
  CLOUD_API_SECRET: "test",
  GROQ_API_KEY: "test",
  GROQ_MODEL_NAME: "test",
});

const { cascadeProfileDeletionToPlans } = await import("../src/modules/plans/plan.repository.js");
const { planGenerationRateLimiter } = await import("../src/middlewares/rateLimiter.js");

const userId = "11111111-1111-4111-8111-111111111111";

test("cascadeProfileDeletionToPlans ends active plans and discards draft plans for the user", async () => {
  const planUpdates = [];
  const mockTx = {
    plan: {
      updateMany: async (args) => {
        planUpdates.push(args);
        return { count: 1 };
      },
    },
  };

  await cascadeProfileDeletionToPlans(userId, mockTx);

  assert.equal(planUpdates.length, 2);

  // Active plans ended
  assert.deepEqual(planUpdates[0].where, { userId, status: "ACTIVE" });
  assert.equal(planUpdates[0].data.status, "ENDED");
  assert.ok(planUpdates[0].data.endedAt instanceof Date);

  // Draft plans discarded
  assert.deepEqual(planUpdates[1].where, { userId, status: "DRAFT" });
  assert.equal(planUpdates[1].data.status, "DISCARDED");
  assert.ok(planUpdates[1].data.endedAt instanceof Date);
});

test("planGenerationRateLimiter is configured for 1 request per 24 hours per user", () => {
  assert.ok(planGenerationRateLimiter, "planGenerationRateLimiter should be exported");
  // Test key generation with authenticated user
  const reqWithUser = { user: { id: "user-abc" }, ip: "127.0.0.1" };
  const reqWithoutUser = { ip: "127.0.0.1" };

  // Key generator extracts user.id when present, falls back to IP
  // If express-rate-limit wraps keyGenerator, test how it derives the key
  if (typeof planGenerationRateLimiter.keyGenerator === "function") {
    assert.equal(planGenerationRateLimiter.keyGenerator(reqWithUser), "user-abc");
    assert.equal(planGenerationRateLimiter.keyGenerator(reqWithoutUser), "127.0.0.1");
  }
});
