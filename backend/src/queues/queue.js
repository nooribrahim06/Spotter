import {PgBoss} from "pg-boss";
import { env } from "../config/env.js";

export const VERIFICATION_EMAIL_QUEUE = "verification-email";

export const boss = new PgBoss({
  connectionString: env.DATABASE_URL,
});

boss.on("error", (error) => {
  console.error("Queue error:", error);
});

export async function startQueue() {
  await boss.start();

  await boss.createQueue(VERIFICATION_EMAIL_QUEUE, {
    retryLimit: 5,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 900,
    deleteAfterSeconds: 24 * 60 * 60,
  });
}