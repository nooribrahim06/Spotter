// src/workers/email.worker.js
import { boss, startQueue, VERIFICATION_EMAIL_QUEUE } from "../queues/queue.js";
import { findUserById } from "../modules/auth/user.repository.js";
import {  sendVerificationEmail } from "../modules/auth/auth.service.js";

await startQueue();

await boss.work(
  VERIFICATION_EMAIL_QUEUE,
  async ([job]) => {
    const { userId, rawToken } = job.data;
    const user = await findUserById(userId);

    if (!user || user.emailVerified) {
      return;
    }

    await sendVerificationEmail({
      email: user.email,
      username: user.username,
      rawToken,
    });
  }
);