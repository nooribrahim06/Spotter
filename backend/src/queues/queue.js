import {PgBoss} from "pg-boss";
import { env } from "../config/env.js";

export const VERIFICATION_EMAIL_QUEUE = "verification-email";

const VERIFICATION_EMAIL_QUEUE_OPTIONS = {
  retryLimit: 5,
  retryDelay: 30,
  retryBackoff: true,
  expireInSeconds: 60,
  retentionSeconds: 24 * 60 * 60,
  deleteAfterSeconds: 60 * 60,
};

export const boss = new PgBoss({
  connectionString: env.DATABASE_URL,
});

boss.on("error", (error) => {
  console.error("Queue error:", error);
});

export async function startQueue() {
  await boss.start();

  await boss.createQueue(
    VERIFICATION_EMAIL_QUEUE,
    VERIFICATION_EMAIL_QUEUE_OPTIONS
  );

  // createQueue leaves an existing queue unchanged, so updateQueue ensures
  // configuration changes also reach environments where the queue exists.
  await boss.updateQueue(
    VERIFICATION_EMAIL_QUEUE,
    VERIFICATION_EMAIL_QUEUE_OPTIONS
  );
}
