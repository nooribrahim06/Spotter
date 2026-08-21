# Node.js and ECMAScript Modules

## What it is

Node.js is the runtime that executes Spotter's backend JavaScript outside a browser. It supplies the HTTP-capable process, asynchronous I/O model, environment access, package resolution, and built-in modules such as `node:crypto`.

Spotter uses ECMAScript modules (ESM), the standard JavaScript module format based on `import` and `export`. The `"type": "module"` declaration in [`backend/package.json`](../../../backend/package.json) tells Node.js to interpret the backend's `.js` files as ESM.

## How Spotter uses it

The process begins in [`src/index.js`](../../../backend/src/index.js):

```js
import "dotenv/config";
import { app } from "./app.js";

const PORT = process.env.PORT || 5050;
const HOST = process.env.HOST || "localhost";

app.listen(PORT, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
```

Node.js provides:

- Module loading for local files and npm packages.
- `process.env` for `PORT`, `HOST`, `DATABASE_URL`, `EMAIL_USER`, and `EMAIL_APP_PASSWORD`.
- `Date` and `Date.now()` for the 24-hour verification-token expiry.
- Promise and `async`/`await` execution for hashing, database work, and email delivery.
- The built-in `node:crypto` module for secure random data and hashing.

The local runtime observed while writing this guide was Node.js `24.18.0`.

## Module conventions used by Spotter

Local ESM imports include the filename extension:

```js
import { authRoutes } from "./modules/auth/auth.routes.js";
```

Built-in modules should use the `node:` prefix:

```js
import crypto from "node:crypto";
```

The prefix makes it explicit that the dependency comes with Node.js and is not downloaded from npm.

## What it can do next

Node.js can support the next backend stages without changing runtimes:

- Graceful shutdown handlers that stop accepting requests and close database resources.
- Native test execution with `node:test`.
- Background jobs and worker threads for CPU-heavy or delayed work.
- Native `.env` loading through `--env-file` or `process.loadEnvFile()` if the project later chooses not to use dotenv.
- Streams for large uploads, exports, or email attachments.
- Built-in diagnostics, source maps, profiling, and process signals.

## Operational notes

- Keep the supported Node.js version explicit in `package.json` through an `engines.node` field or a version-manager file.
- Do not install npm replacements for built-in modules. For example, `node:path` is already part of Node.js; the `path` package currently listed in dev dependencies is unrelated to the import resolution used by the code.
- Environment variables are strings or `undefined`. Parse and validate numeric and required configuration before starting the server.
- Long-running resources should be closed during shutdown. This becomes important once connection pooling and queued email work are in production.

## Official references

- [Node.js ECMAScript modules](https://nodejs.org/api/esm.html)
- [Node.js package and `type` rules](https://nodejs.org/api/packages.html)
- [Node.js environment variables](https://nodejs.org/api/environment_variables.html)
- [Node.js Crypto API](https://nodejs.org/api/crypto.html)

