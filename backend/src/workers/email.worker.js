// src/workers/email.worker.js
import crypto from "node:crypto";
import { boss, startQueue, VERIFICATION_EMAIL_QUEUE } from "../queues/queue.js";
import { decryptQueueToken } from "../queues/queueCrypto.js";
import { findPendingVerificationEmailRecipient } from "../modules/users/user.repository.js";
import { sendVerificationEmail } from "../emails/verificationEmail.service.js";
export async function startEmailWorker() {


await boss.work(
  VERIFICATION_EMAIL_QUEUE,
  async ([job]) => {
    const { userId, encryptedToken, verificationTokenHash } = job.data;

    if (
      !userId ||
      !encryptedToken ||
      !/^[a-f0-9]{64}$/.test(verificationTokenHash)
    ) {
      return;
    }

    // 1. Check if this is still the user's current verification token.
    // If the user requested another email, this old job will be ignored.
    const user = await findPendingVerificationEmailRecipient({
      userId,
      verificationTokenHash,
    });

    if (!user) {
      return;
    }

    // 2. Decrypt the raw token and make sure it belongs to this job.
    const rawToken = decryptQueueToken(encryptedToken);
    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    if (hashedToken !== verificationTokenHash) {
      return;
    }

    // 3. Everything is valid, so send the email.
    await sendVerificationEmail({
      email: user.email,
      username: user.username,
      rawToken,
    });
  }
);
}