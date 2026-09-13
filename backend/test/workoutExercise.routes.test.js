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

test("all workout-exercise mutation routes require authentication", async () => {
  const workoutId = "22222222-2222-4222-8222-222222222222";
  const itemId = "33333333-3333-4333-8333-333333333333";
  const requests = [
    ["POST", `/api/workouts/${workoutId}/exercises`],
    ["PATCH", `/api/workouts/${workoutId}/exercises/${itemId}`],
    ["DELETE", `/api/workouts/${workoutId}/exercises/${itemId}`],
  ];

  for (const [method, path] of requests) {
    const response = await fetch(baseUrl + path, { method });
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.code, "INVALID_ACCESS_TOKEN");
  }
});
