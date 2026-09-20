import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { createHash } from "node:crypto";
import nodemailer from "nodemailer";

Object.assign(process.env, {
  NODE_ENV: "test", DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  FRONTEND_URL: "http://localhost:5173", ACCESS_TOKEN_SECRET: Buffer.alloc(32, 1).toString("base64url"),
  EMAIL_USER: "test@example.com", EMAIL_APP_PASSWORD: "test",
  CLOUD_NAME: "test", CLOUD_API_KEY: "test", CLOUD_API_SECRET: "test",
  GROQ_API_KEY: "test", GROQ_API_KEY2: "test", GROQ_TOOL_MODEL: "test", GROQ_GENERATION_MODEL: "test",
  GEMINI_API_KEY: "test", GEMINI_MODEL: "test",
});
const transport = { async sendMail() { throw new Error("Unexpected email"); } };
const transportMock = mock.method(nodemailer, "createTransport", () => transport);
const { signup, resendVerificationEmail } = await import("../src/modules/auth/auth.service.js");
transportMock.mock.restore();
const { prisma } = await import("../src/lib/prisma.js");

test("temporary direct verification delivery", async (t) => {
  await t.test("signup commits before sending, awaits delivery and sends the matching token", async (t) => {
    let committed = false, saved;
    let release;
    const delivered = new Promise((resolve) => { release = resolve; });
    let sending;
    const started = new Promise((resolve) => { sending = resolve; });
    t.mock.method(prisma, "$transaction", async (fn) => {
      const result = await fn({ user: { create: async ({ data }) => {
        saved = data; return { id: "user", email: data.email, username: data.username };
      } } });
      committed = true;
      return result;
    });
    t.mock.method(transport, "sendMail", async (mail) => {
      assert.equal(committed, true);
      assert.equal(mail.to, "user@example.com");
      const token = mail.text.match(/token=([a-f0-9]+)/)[1];
      assert.equal(createHash("sha256").update(token).digest("hex"), saved.verifyToken);
      sending();
      await delivered;
    });
    let finished = false;
    const pending = signup({ email: " USER@example.com ", username: "User", password: "test-password" })
      .then((result) => { finished = true; return result; });
    await started;
    assert.equal(finished, false);
    release();
    assert.match((await pending).message, /User created/);
  });

  await t.test("failed database save sends no email", async (t) => {
    t.mock.method(prisma, "$transaction", async () => { throw new Error("save failed"); });
    const send = t.mock.method(transport, "sendMail", async () => {});
    await assert.rejects(signup({ email: "user@example.com", username: "User", password: "test-password" }), /save failed/);
    assert.equal(send.mock.callCount(), 0);
  });

  await t.test("resend failure preserves generic response and zero updated rows send nothing", async (t) => {
    let user = null, count = 1, committed = false;
    t.mock.method(prisma.user, "findUnique", async () => user);
    const generic = await resendVerificationEmail("user@example.com");
    user = { id: "user", email: "user@example.com", username: "user", emailVerified: false };
    t.mock.method(prisma, "$transaction", async (fn) => {
      const result = await fn({ user: { updateMany: async () => ({ count }) } });
      committed = true; return result;
    });
    t.mock.method(console, "error", () => {});
    const send = t.mock.method(transport, "sendMail", async () => {
      assert.equal(committed, true);
      throw new Error("SMTP unavailable");
    });
    assert.deepEqual(await resendVerificationEmail(user.email), generic);
    assert.equal(send.mock.callCount(), 1);
    count = 0;
    assert.deepEqual(await resendVerificationEmail(user.email), generic);
    assert.equal(send.mock.callCount(), 1);
    user.emailVerified = true;
    assert.deepEqual(await resendVerificationEmail(user.email), generic);
    assert.equal(send.mock.callCount(), 1);
  });
});
