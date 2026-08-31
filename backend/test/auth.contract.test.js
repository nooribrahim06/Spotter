import assert from "node:assert/strict";
import { after, before, test } from "node:test";

process.env.NODE_ENV = "test";
process.env.PORT = "5050";
process.env.HOST = "localhost";
process.env.DATABASE_URL = "postgresql://spotter:spotter@localhost:5432/spotter_test";
process.env.FRONTEND_URL = "http://localhost:5173";
process.env.ACCESS_TOKEN_SECRET = Buffer.alloc(32, 1).toString("base64url");
process.env.ACCESS_TOKEN_EXPIRATION = "15m";
process.env.REFRESH_TOKEN_EXPIRATION = "7d";
process.env.SESSION_EXPIRATION = "30d";
process.env.EMAIL_USER = "test@example.com";
process.env.EMAIL_APP_PASSWORD = "test-password";

const { app } = await import("../src/app.js");
const { createAccessToken, verifyAccessToken } = await import(
  "../src/modules/auth/auth.tokens.js"
);
const {
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  InvalidSessionError,
} = await import(
  "../src/middlewares/errorHandling.js"
);
const { createVerifyEmail } = await import(
  "../src/emails-temp/verifyUremail.js"
);
const { encryptQueueToken, decryptQueueToken } = await import(
  "../src/queues/queueCrypto.js"
);
const { step1Schema, step2Schema } = await import(
  "../src/modules/on-boarding/onboarding.validation.js"
);

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

after(async () => {
  if (!server) return;

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
});

test("access tokens expire after 15 minutes", () => {
  const token = createAccessToken({
    userId: "11111111-1111-4111-8111-111111111111",
    sessionId: "22222222-2222-4222-8222-222222222222",
  });

  const decoded = verifyAccessToken(token);
  assert.equal(decoded.exp - decoded.iat, 15 * 60);
});

test("credential errors remain generic", () => {
  const error = new InvalidCredentialsError();

  assert.equal(error.code, "INVALID_CREDENTIALS");
  assert.equal(error.message, "Invalid email or password.");
});

test("refresh and session errors have distinct internal codes", () => {
  const refreshError = new InvalidRefreshTokenError();
  const sessionError = new InvalidSessionError();

  assert.equal(refreshError.code, "INVALID_REFRESH_TOKEN");
  assert.equal(sessionError.code, "INVALID_SESSION");
  assert.equal(refreshError.message, "Invalid or expired session.");
  assert.equal(sessionError.message, "Invalid or expired session.");
});

test("verification email escapes usernames and uses a CID mascot", () => {
  const token = "a".repeat(64);
  const html = createVerifyEmail(
    `<script>alert("x")</script>&'`,
    token
  );

  assert.equal(html.includes("<script>"), false);
  assert.ok(
    html.includes(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;"
    )
  );
  assert.ok(html.includes('src="cid:spotter-verification-mascot"'));
  assert.ok(
    html.includes(
      `${process.env.FRONTEND_URL}/verify-email?token=${token}`
    )
  );
  assert.equal(html.includes("https://http://"), false);
});

test("verification tokens are authenticated and encrypted in queue payloads", () => {
  const rawToken = "a".repeat(64);
  const encryptedToken = encryptQueueToken(rawToken);

  assert.equal(encryptedToken.includes(rawToken), false);
  assert.equal(decryptQueueToken(encryptedToken), rawToken);

  const parts = encryptedToken.split(".");
  const ciphertext = Buffer.from(parts[2], "base64url");
  ciphertext[0] ^= 1;
  parts[2] = ciphertext.toString("base64url");

  assert.throws(() => decryptQueueToken(parts.join(".")));
});

test("refresh without a cookie follows the standard error contract", async () => {
  const response = await fetch(`${baseUrl}/api/auth/refresh`, {
    method: "POST",
  });
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.deepEqual(body, {
    error: "Invalid or expired session.",
    code: "INVALID_SESSION",
  });
});

test("logout all without a cookie remains idempotent and clears it", async () => {
  const response = await fetch(`${baseUrl}/api/auth/logout-all`, {
    method: "POST",
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    message: "Logged out of all sessions successfully.",
  });
  assert.match(response.headers.get("set-cookie"), /^refreshToken=;/);
});

test("validation errors expose only field names and public messages", async () => {
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: "not-an-email",
      username: "x",
      password: "short",
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error, "Validation failed.");
  assert.equal(body.code, "INVALID_SCHEMA");
  assert.ok(Array.isArray(body.details));
  assert.deepEqual(
    Object.keys(body.details[0]).sort(),
    ["field", "message"]
  );
  assert.ok(body.details.some((detail) => detail.field === "email"));
  assert.ok(body.details.some((detail) => detail.field === "username"));
  assert.ok(body.details.some((detail) => detail.field === "password"));
  assert.equal(JSON.stringify(body).includes("not-an-email"), false);
  assert.equal(JSON.stringify(body).includes("short"), false);
});

test("resend verification validates email without exposing submitted values", async () => {
  const response = await fetch(`${baseUrl}/api/auth/resend-verification`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: "not-an-email" }),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.code, "INVALID_SCHEMA");
  assert.deepEqual(body.details.map((detail) => detail.field), ["email"]);
  assert.equal(JSON.stringify(body).includes("not-an-email"), false);
});

test("CORS allows the configured frontend and credentials", async () => {
  const response = await fetch(`${baseUrl}/api/auth/refresh`, {
    method: "OPTIONS",
    headers: {
      Origin: process.env.FRONTEND_URL,
      "Access-Control-Request-Method": "POST",
    },
  });

  assert.equal(response.status, 204);
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    process.env.FRONTEND_URL
  );
  assert.equal(
    response.headers.get("access-control-allow-credentials"),
    "true"
  );
});

test("CORS does not authorize an unconfigured origin", async () => {
  const response = await fetch(`${baseUrl}/api/auth/refresh`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://attacker.example",
      "Access-Control-Request-Method": "POST",
    },
  });

  assert.equal(response.headers.get("access-control-allow-origin"), null);
});

test("onboarding step 1 validates the complete birth date and adult age", () => {
  const validResult = step1Schema.safeParse({
    firstName: "Noor",
    lastName: "Ibrahim",
    birthYear: new Date().getUTCFullYear() - 25,
    birthMonth: 6,
    birthDay: 15,
    adultConfirmed: true,
    sexForCalculation: "MALE",
    preferredUnitSystem: "METRIC",
    heightCm: 178,
    currentWeightKg: 82.5,
  });

  assert.equal(validResult.success, true);

  const invalidDateResult = step1Schema.safeParse({
    firstName: "Noor",
    lastName: "Ibrahim",
    birthYear: 2001,
    birthMonth: 2,
    birthDay: 29,
    adultConfirmed: true,
    sexForCalculation: "FEMALE",
    preferredUnitSystem: "IMPERIAL",
    heightCm: 165,
    currentWeightKg: 60,
  });

  assert.equal(invalidDateResult.success, false);
  assert.ok(
    invalidDateResult.error.issues.some(
      (issue) => issue.path.join(".") === "birthDay"
    )
  );
});

test("onboarding step 2 handles optional goal data", () => {
  const maintainResult = step2Schema.safeParse({
    goalType: "MAINTAIN_WEIGHT",
    targetWeightKg: null,
    targetDate: null,
    activityLevel: "MODERATELY_ACTIVE",
  });
  const fitnessResult = step2Schema.safeParse({
    goalType: "IMPROVE_FITNESS",
    activityLevel: "VERY_ACTIVE",
  });
  const missingRequiredWeight = step2Schema.safeParse({
    goalType: "LOSE_WEIGHT",
    targetDate: null,
    activityLevel: "LIGHTLY_ACTIVE",
  });

  assert.equal(maintainResult.success, true);
  assert.equal(fitnessResult.success, true);
  assert.equal(missingRequiredWeight.success, false);
  assert.ok(
    missingRequiredWeight.error.issues.some(
      (issue) => issue.path.join(".") === "targetWeightKg"
    )
  );
});

test("all onboarding routes require a valid access token", async () => {
  const requests = [
    ["GET", "/api/onboarding/config"],
    ["GET", "/api/onboarding"],
    ["PATCH", "/api/onboarding"],
    ["POST", "/api/onboarding/complete"],
  ];

  for (const [method, path] of requests) {
    const response = await fetch(`${baseUrl}${path}`, { method });
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.code, "INVALID_ACCESS_TOKEN");
  }
});

test("all private profile routes require a valid access token", async () => {
  const requests = [
    ["GET", "/api/profiles/config"],
    ["GET", "/api/profiles/me"],
    ["PATCH", "/api/profiles/me/public"],
    ["PATCH", "/api/profiles/me/account-preferences"],
    ["POST", "/api/profiles/me/body"],
    ["PATCH", "/api/profiles/me/body"],
    ["DELETE", "/api/profiles/me/body"],
    ["PUT", "/api/profiles/me/health"],
    ["PUT", "/api/profiles/me/nutrition"],
    ["PUT", "/api/profiles/me/training"],
    ["PUT", "/api/profiles/me/coaching"],
    ["POST", "/api/profiles/me/progress"],
    ["GET", "/api/profiles/me/targets"],
  ];

  for (const [method, path] of requests) {
    const response = await fetch(`${baseUrl}${path}`, { method });
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.code, "INVALID_ACCESS_TOKEN");
  }
});
