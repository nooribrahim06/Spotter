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

const { completeGoal, cancelGoal } = await import("../src/modules/goals/goal.service.js");
const { cascadeGoalStatusChangeToPlans } = await import("../src/modules/plans/plan.repository.js");
const { getActivePlan } = await import("../src/modules/plans/plan.service.js");

const userId = "11111111-1111-4111-8111-111111111111";
const goalId = "22222222-2222-4222-8222-222222222222";

test("cascadeGoalStatusChangeToPlans ends active plans and discards draft plans", async () => {
  const planUpdates = [];
  const mockTx = {
    plan: {
      updateMany: async (args) => {
        planUpdates.push(args);
        return { count: 1 };
      },
    },
  };

  await cascadeGoalStatusChangeToPlans(userId, goalId, mockTx);

  assert.equal(planUpdates.length, 2);

  // Active plan ended
  assert.deepEqual(planUpdates[0].where, { userId, goalId, status: "ACTIVE" });
  assert.equal(planUpdates[0].data.status, "ENDED");
  assert.ok(planUpdates[0].data.endedAt instanceof Date);

  // Draft plan discarded
  assert.deepEqual(planUpdates[1].where, { userId, goalId, status: "DRAFT" });
  assert.deepEqual(planUpdates[1].data, { status: "DISCARDED" });
});

test("completeGoal cascades to associated plans within transaction", async () => {
  const planUpdates = [];
  const mockDb = {
    goal: {
      findFirst: async () => ({ id: goalId, userId, status: "ACTIVE" }),
    },
    $transaction: async (cb) => {
      const tx = {
        $queryRaw: async () => [{ id: userId }],
        goal: {
          updateManyAndReturn: async (args) => [
            { id: goalId, userId, status: "COMPLETED", ...args.data },
          ],
        },
        plan: {
          updateMany: async (args) => {
            planUpdates.push(args);
            return { count: 1 };
          },
        },
      };
      return cb(tx);
    },
  };

  const result = await completeGoal(userId, goalId, mockDb);
  assert.equal(result.status, "COMPLETED");
  assert.equal(planUpdates.length, 2);
  assert.equal(planUpdates[0].data.status, "ENDED");
  assert.equal(planUpdates[1].data.status, "DISCARDED");
});

test("cancelGoal cascades to associated plans within transaction", async () => {
  const planUpdates = [];
  const mockDb = {
    goal: {
      findFirst: async () => ({ id: goalId, userId, status: "ACTIVE" }),
    },
    $transaction: async (cb) => {
      const tx = {
        $queryRaw: async () => [{ id: userId }],
        goal: {
          updateManyAndReturn: async (args) => [
            { id: goalId, userId, status: "CANCELLED", ...args.data },
          ],
        },
        plan: {
          updateMany: async (args) => {
            planUpdates.push(args);
            return { count: 1 };
          },
        },
      };
      return cb(tx);
    },
  };

  const result = await cancelGoal(userId, goalId, mockDb);
  assert.equal(result.status, "CANCELLED");
  assert.equal(planUpdates.length, 2);
  assert.equal(planUpdates[0].data.status, "ENDED");
  assert.equal(planUpdates[1].data.status, "DISCARDED");
});

test("getActivePlan returns null if the plan has passed its endDate in the plan's timezone", async () => {
  // Plan expired yesterday
  const expiredPlan = {
    id: "plan-1",
    userId,
    status: "ACTIVE",
    timezone: "UTC",
    endDate: new Date("2020-01-01T00:00:00.000Z"),
  };

  const mockDb = {
    plan: {
      findFirst: async () => expiredPlan,
    },
  };

  const result = await getActivePlan(userId, mockDb);
  assert.equal(result, null);
});

test("getActivePlan returns plan if current date is within endDate", async () => {
  // Plan active in the future
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 5);

  const activePlan = {
    id: "plan-2",
    userId,
    status: "ACTIVE",
    timezone: "UTC",
    endDate: futureDate,
  };

  const mockDb = {
    plan: {
      findFirst: async () => activePlan,
    },
  };

  const result = await getActivePlan(userId, mockDb);
  assert.equal(result.id, "plan-2");
  assert.equal(result.status, "ACTIVE");
});
