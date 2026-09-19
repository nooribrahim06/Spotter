// src/workers/plan.worker.js
import { boss, startQueue, PLAN_LIFECYCLE_QUEUE } from "../queues/queue.js";
import { expireOverduePlans } from "../modules/plans/plan.repository.js";

await startQueue();

console.log("[Plan Worker] Plan lifecycle worker started and listening for jobs...");

await boss.work(
  PLAN_LIFECYCLE_QUEUE,
  async ([job]) => {
    const startedAt = new Date();
    console.log(`[Plan Worker] Starting expiration sweep at ${startedAt.toISOString()}...`);

    try {
      const result = await expireOverduePlans();
      const elapsedMs = Date.now() - startedAt.getTime();
      console.log(
        `[Plan Worker] Sweep completed in ${elapsedMs}ms: ` +
        `${result.discardedDraftsCount} drafts discarded, ${result.endedActivePlansCount} active plans ended.`
      );
    } catch (error) {
      console.error("[Plan Worker] Error during plan expiration sweep:", error);
      throw error;
    }
  }
);
