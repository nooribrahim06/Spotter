# Environment Variables and dotenv

## What it is

Environment variables keep deploy-specific configuration outside application source. Node.js exposes them through `process.env`. A `.env` file is a local key-value file commonly used to populate those variables during development.

`dotenv` is a package that reads a `.env` file and adds its values to `process.env`. The side-effect import below loads the default `.env` file:

```js
import "dotenv/config";
```

## How Spotter uses it

Environment loading appears in:

- [`src/index.js`](../../../backend/src/index.js), before application startup.
- [`src/lib/prisma.js`](../../../backend/src/lib/prisma.js), before reading `DATABASE_URL`.
- [`prisma.config.ts`](../../../backend/prisma.config.ts), for Prisma CLI configuration.

Current configuration keys are:

| Variable | Consumer | Purpose | Current fallback |
| --- | --- | --- | --- |
| `PORT` | `src/index.js` | HTTP listen port | `5050` |
| `HOST` | `src/index.js` | Host shown in the startup message | `localhost` |
| `DATABASE_URL` | Prisma config and runtime client | PostgreSQL connection string | None |
| `EMAIL_USER` | Nodemailer | Gmail account and From address | None |
| `EMAIL_APP_PASSWORD` | Nodemailer | Gmail SMTP app password | None |

The backend's [`.gitignore`](../../../backend/.gitignore) excludes `.env`, which is essential because the file contains secrets.

## Important dependency status

Spotter imports `dotenv/config`, but `dotenv` is not currently declared as a direct dependency in `backend/package.json`. It is available locally only because Prisma's dependency tree currently installs it transitively.

Code should not rely on a transitive package. A future Prisma update can remove or rearrange that dependency and make application startup fail. Declare `dotenv` directly if Spotter intends to keep importing it. This guide documents the condition but does not modify dependencies.

## What it can do next

- Add `FRONTEND_URL` so verification links are not hard-coded to localhost.
- Add environment-specific email sender, CORS origin, logging, and feature flags.
- Validate all required variables once during startup using Zod.
- Maintain a committed `.env.example` containing names and safe placeholders, never real secrets.
- Use platform secret managers in staging and production.
- Use Node.js's native `--env-file` or `process.loadEnvFile()` if the project later removes dotenv.

## Security and operational notes

- Never commit `.env`, production credentials, app passwords, or database URLs.
- Do not print full configuration objects; URLs and provider errors may contain credentials.
- Fail fast when required configuration is missing. Creating half-configured clients usually moves the failure to the first user request.
- Values in `process.env` are strings or `undefined`; parse ports, booleans, durations, and lists deliberately.
- Load configuration before importing modules that read it during module initialization.
- Rotate any secret that is accidentally exposed, even if it is later removed from Git.

## Official references

- [Node.js environment variables and `.env` files](https://nodejs.org/api/environment_variables.html)
- [dotenv repository and documentation](https://github.com/motdotla/dotenv)
- [The Twelve-Factor App: Config](https://12factor.net/config)
