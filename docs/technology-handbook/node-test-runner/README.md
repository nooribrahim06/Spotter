# Node.js Test Runner (`node:test`)

## What it is

Node.js ships a built-in test runner starting from Node 18. It provides `test()`, `describe()`, lifecycle hooks (`before`, `after`, `beforeEach`, `afterEach`), and assertion utilities through the standard library modules `node:test` and `node:assert`. No third-party framework (Jest, Mocha, Vitest) is needed.

Spotter uses the built-in test runner for **contract tests** that verify the API's HTTP responses, error shapes, token behavior, CORS policy, and security invariants — all without mocking internals.

## Why Spotter chose it

| Requirement | How node:test satisfies it |
| --- | --- |
| Zero dependencies | No `devDependency` to install, configure, or keep updated. Reduces supply-chain risk and lockfile churn. |
| Fast startup | No framework boot time. `node --test` discovers and runs test files immediately. |
| Built-in assertions | `node:assert/strict` provides `equal`, `deepEqual`, `ok`, `throws`, `match`, and more — covering everything Spotter's tests need. |
| ESM-native | Works directly with `import`/`await` at the top level, matching Spotter's ES module codebase. No special transform or loader needed. |
| Stable API | Part of Node.js core with LTS support. The API is unlikely to introduce breaking changes. |

## How Spotter uses it

### Test file

All contract tests live in [`test/auth.contract.test.js`](../../../backend/test/auth.contract.test.js).

### Running tests

```bash
npm test
# which runs: node --test
```

### Test structure

```js
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

// Set environment variables before any app import
process.env.NODE_ENV = "test";
// ...other env vars...

// Dynamic imports to ensure env is set first
const { app } = await import("../src/app.js");

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

test("access tokens expire after 15 minutes", () => {
  const token = createAccessToken({ ... });
  const decoded = verifyAccessToken(token);
  assert.equal(decoded.exp - decoded.iat, 15 * 60);
});
```

### Key patterns

1. **Environment-before-import** — `process.env` is set before any `await import()` so that the Zod env validator sees test values.
2. **Ephemeral server** — `app.listen(0)` binds to a random free port, avoiding port conflicts.
3. **Real HTTP requests** — Tests use the global `fetch()` (Node 18+) to make actual HTTP calls, testing the full middleware stack.
4. **No mocking** — The tests verify the contract (status codes, response shapes, headers) without stubbing internals, so they remain valid even as implementation details change.

### What the tests cover

| Test | What it verifies |
| --- | --- |
| Access token expiry | `exp - iat === 900` (15 minutes). |
| Credential error shape | Error code is `INVALID_CREDENTIALS`, message is generic. |
| Email HTML escaping | XSS payloads in usernames are escaped; CID image references work. |
| Queue token encryption | Encrypted token does not contain raw token; decryption round-trips; tampered ciphertext is rejected. |
| Refresh without cookie | Returns `401` with the standard error contract. |
| Logout-all without cookie | Returns `200`, clears the cookie. |
| Validation error shape | Returns `400`, includes `field` + `message` details, never echoes submitted values. |
| CORS allowed origin | Configured frontend gets `Allow-Origin` + `Allow-Credentials`. |
| CORS blocked origin | Unconfigured origin gets no CORS headers. |

## API currently used

| API | Spotter purpose |
| --- | --- |
| `test(name, fn)` | Define a single test case. |
| `before(fn)` | Run setup once before all tests (start the server). |
| `after(fn)` | Run teardown once after all tests (close the server). |
| `assert.equal(a, b)` | Strict equality check. |
| `assert.deepEqual(a, b)` | Deep strict equality for objects and arrays. |
| `assert.ok(value)` | Truthiness check. |
| `assert.throws(fn)` | Verify that a function throws. |
| `assert.match(string, regex)` | Verify a string matches a regular expression. |

## What it can do next

- **`describe()` blocks** — Group related tests with `describe()` for better output organization (e.g., group all CORS tests, all validation tests).
- **`it()` alias** — `it` is available as an alias for `test` inside `describe` blocks, for BDD-style naming.
- **`beforeEach` / `afterEach`** — Useful for database seeding/cleanup if the tests evolve to cover full integration flows (signup → verify → login).
- **`test.skip()` / `test.todo()`** — Mark tests as skipped or planned.
- **`test.only()`** — Run a single test during debugging.
- **`--test-reporter`** — Change output format (e.g., `spec`, `dot`, `tap`, or a custom reporter).
- **`--test-timeout`** — Set a global timeout for tests that make network calls.
- **`mock` from `node:test`** — The built-in `mock` module can spy on or stub functions without a library like Sinon, useful for isolating the email transport in integration tests.
- **`--experimental-test-coverage`** — Generate code coverage reports without installing `c8` or `istanbul`.
- **Snapshot testing** — `assert.snapshot()` (available in newer Node versions) can snapshot JSON response bodies.
- **Parallel test files** — `node --test test/*.test.js` runs multiple test files in parallel by default, speeding up the suite as it grows.

## Operational notes

- The test file uses **top-level `await`** for dynamic imports. This requires `"type": "module"` in `package.json`, which Spotter already sets.
- Tests suppress console output by checking `env.NODE_ENV !== "test"` in the error handler. This keeps test output clean.
- `app.listen(0)` is critical for CI — it avoids port conflicts when multiple test runs execute in parallel.
- The test suite does **not** connect to a real database (it only tests components that don't require one). Full integration tests would need a test database and a `before` hook to run migrations.
- Node.js test runner has been stable since Node 20 and is fully supported in Node 24.18.0 (Spotter's runtime).

## Official references

- [Node.js Test Runner documentation](https://nodejs.org/api/test.html)
- [Node.js Assert documentation](https://nodejs.org/api/assert.html)
- [Node.js test runner guide](https://nodejs.org/en/learn/test-runner/introduction)
