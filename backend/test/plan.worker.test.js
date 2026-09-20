import assert from "node:assert/strict";
import { test } from "node:test";

Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://spotter:spotter@localhost:5432/spotter_test",
  FRONTEND_URL: "http://localhost:5173",
  ACCESS_TOKEN_SECRET: Buffer.alloc(32, 1).toString("base64url"),
  EMAIL_USER: "test@example.com",
  EMAIL_APP_PASSWORD: "test-password",
  CLOUD_NAME: "test",
  CLOUD_API_KEY: "test",
  CLOUD_API_SECRET: "test",
  GROQ_API_KEY: "test",
  GROQ_MODEL_NAME: "test",
});

const { expireOverduePlans } = await import("../src/modules/plans/plan.repository.js");
const { PLAN_LIFECYCLE_QUEUE } = await import("../src/queues/queue.js");

test("PLAN_LIFECYCLE_QUEUE is properly defined", () => {
  assert.equal(PLAN_LIFECYCLE_QUEUE, "plan-lifecycle");
});

test("expireOverduePlans executes raw updates and returns counts", async () => {
  const queries = [];
  const mockDb = {
    $transaction: async (cb) => {
      const tx = {
        $executeRaw: async (strings, ...values) => {
          queries.push({ strings, values });
          // Return 3 drafts discarded on first query, 2 active plans ended on second
          return queries.length === 1 ? 3 : 2;
        },
      };
      return cb(tx);
    },
  };

  const asOfDate = new Date("2026-09-19T00:00:00.000Z");
  const result = await expireOverduePlans(asOfDate, mockDb);

  assert.equal(queries.length, 2);
  assert.equal(result.discardedDraftsCount, 3);
  assert.equal(result.endedActivePlansCount, 2);
  assert.ok(queries[0].strings.join("").includes("plans.timezone"));
  assert.ok(queries[1].strings.join("").includes("plans.timezone"));
});

test("expireOverduePlans wraps unexpected DB errors in databaseError", async () => {
  const mockDb = {
    $transaction: async () => {
      throw new Error("Connection failed");
    },
  };

  await assert.rejects(
    () => expireOverduePlans(new Date(), mockDb),
    (err) => err.statusCode === 500 && err.message.includes("Database error occurred while expiring overdue plans.")
  );
});
