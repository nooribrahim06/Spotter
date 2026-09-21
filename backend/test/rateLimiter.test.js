import assert from "node:assert/strict";
import { after, before, test } from "node:test";

process.env.NODE_ENV = "test";
process.env.PORT = "5050";
process.env.HOST = "localhost";
process.env.DATABASE_URL =
  "postgresql://spotter:spotter@localhost:5432/spotter_test";
process.env.FRONTEND_URL = "http://localhost:5173";
process.env.ACCESS_TOKEN_SECRET = Buffer.alloc(32, 1).toString("base64url");
process.env.ACCESS_TOKEN_EXPIRATION = "15m";
process.env.REFRESH_TOKEN_EXPIRATION = "7d";
process.env.SESSION_EXPIRATION = "30d";
process.env.EMAIL_USER = "test@example.com";
process.env.EMAIL_APP_PASSWORD = "test-password";
process.env.CLOUD_NAME = "test-cloud";
process.env.CLOUD_API_KEY = "test-key";
process.env.CLOUD_API_SECRET = "test-secret";

const { app } = await import("../src/app.js");

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

test("Vercel's forwarded client IP is accepted through one trusted proxy hop", async () => {
  assert.equal(app.get("trust proxy"), 1);

  const response = await fetch(`${baseUrl}/api/rate-limit-proxy-probe`, {
    headers: {
      "X-Forwarded-For": "203.0.113.10",
    },
  });

  assert.equal(response.status, 404);
  assert.ok(response.headers.get("ratelimit"));
});

test("every API endpoint is protected by the shared rate limit", async () => {
  const results = [];

  for (let start = 0; start < 301; start += 10) {
    const batchSize = Math.min(10, 301 - start);
    const batch = await Promise.all(
      Array.from({ length: batchSize }, async () => {
        const response = await fetch(`${baseUrl}/api/rate-limit-probe`);

        return {
          status: response.status,
          rateLimitHeader: response.headers.get("ratelimit"),
          legacyHeader: response.headers.get("x-ratelimit-limit"),
          body: await response.text(),
        };
      })
    );

    results.push(...batch);
  }

  const allowedResponses = results.filter((result) => result.status === 404);
  const limitedResponses = results.filter((result) => result.status === 429);

  assert.equal(allowedResponses.length, 300);
  assert.equal(limitedResponses.length, 1);
  assert.ok(allowedResponses[0].rateLimitHeader);
  assert.equal(allowedResponses[0].legacyHeader, null);
  assert.deepEqual(JSON.parse(limitedResponses[0].body), {
    error: "Too many requests. Please try again later.",
    code: "TOO_MANY_REQUESTS",
  });
});
