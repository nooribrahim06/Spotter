# Spotter Backend Technology Handbook

This handbook documents the technologies that the current Spotter backend actually uses. It is written around the repository rather than as a generic package list: every guide explains the technology, identifies the relevant Spotter files, describes the current request flow, and outlines reasonable next uses.

## Runtime snapshot

The versions below were observed in the local project on 2026-08-26.

| Technology | Installed version | Role in Spotter |
| --- | ---: | --- |
| [Node.js and ES modules](./nodejs-esm/README.md) | Node.js 24.18.0 | JavaScript runtime and module system |
| [Express](./express/README.md) | 5.2.1 | HTTP application, routers, middleware, and responses |
| [cors](./cors/README.md) | 2.8.6 | Cross-origin request handling for the frontend |
| [cookie-parser](./cookie-parser/README.md) | 1.4.7 | HTTP cookie parsing for refresh tokens |
| [express-rate-limit](./express-rate-limit/README.md) | 8.6.2 | Abuse protection across all auth endpoints |
| [Zod](./zod/README.md) | 4.4.3 | Request-body validation and transformation |
| [csv-parse](./csv-parse/README.md) | 7.0.2 | Parsing large CSV catalog data during database seeding |
| [jsonwebtoken](./jsonwebtoken/README.md) | 9.0.3 | Access token signing and verification (JWT) |
| [bcryptjs](./bcryptjs/README.md) | 3.0.3 | Password hashing |
| [Node.js Crypto](./node-crypto/README.md) | Built into Node.js | Token generation, SHA-256 hashing, and AES-256-GCM queue encryption |
| [Nodemailer](./nodemailer/README.md) | 9.0.5 | Verification-email delivery through Gmail |
| [pg-boss](./pg-boss/README.md) | 12.28.0 | PostgreSQL-backed background job queue for email delivery |
| [Prisma ORM](./prisma/README.md) | 7.9.1 | Schema, generated client, queries, and database errors |
| [PostgreSQL, `pg`, and PrismaPg](./postgresql-pg/README.md) | `pg` 8.23.0; adapter 7.9.1 | Persistent storage and database connectivity |
| [Environment variables and dotenv](./dotenv/README.md) | dotenv 17.4.2, currently transitive | Local configuration and secret loading |
| [Node.js Test Runner](./node-test-runner/README.md) | Built into Node.js | Contract testing with `node:test` and `node:assert` |
| [Nodemon](./nodemon/README.md) | 3.1.14 | Automatic development-server restarts |
| [Cloudinary](./cloudinary/README.md) | 2.11.0 | Cloud media asset management and optimization |
| [AI tool calling and catalog execution](./ai-tool-calling/README.md) | Application pattern; Gemini adapter via `@google/genai` 2.23.0 | Bounded model-directed catalog searches executed and authorized by the backend |
| [Structured outputs and JSON Schema](./structured-output-schemas/README.md) | Zod 4.4.3; Gemini and Groq provider APIs | Schema-constrained AI search batches and generated plans with authoritative backend validation |


## Auth stack at a glance

```text
Node.js
└── Express application
    ├── cors (allow FRONTEND_URL with credentials)
    ├── cookieParser (populate req.cookies)
    │
    ├── POST /api/auth/signup
    │   ├── express-rate-limit (5 per 15 min)
    │   ├── express.json()
    │   ├── Zod validation
    │   └── Controller → Auth service
    │       ├── bcryptjs password hash
    │       ├── Node Crypto verification token
    │       └── Prisma $transaction
    │           ├── createUser(tx)
    │           └── pg-boss send(queue, payload, { db: fromPrisma(tx) })
    │                         │
    │                         ▼
    │               email.worker.js (separate process)
    │                   ├── pg-boss work()
    │                   ├── AES-256-GCM decrypt (Node Crypto)
    │                   └── Nodemailer → Gmail SMTP
    │
    ├── POST /api/auth/verify-email
    │   ├── express-rate-limit (30 per 15 min)
    │   ├── express.json()
    │   ├── Zod validation
    │   └── Controller → verifyUserByToken (Prisma)
    │
    ├── POST /api/auth/resend-verification
    │   ├── express-rate-limit (5 per 15 min)
    │   ├── express.json()
    │   ├── Zod validation
    │   └── Controller → Auth service
    │       └── Prisma $transaction + pg-boss send
    │
    ├── POST /api/auth/login
    │   ├── express-rate-limit (10 per 15 min)
    │   ├── express.json()
    │   ├── Zod validation
    │   └── Controller → Auth service
    │       ├── bcryptjs compare (with dummy hash for timing safety)
    │       ├── Node Crypto IP hash
    │       ├── Prisma $transaction (session + refresh token)
    │       ├── jsonwebtoken sign (access token)
    │       └── res.cookie (refresh token, httpOnly)
    │
    ├── POST /api/auth/refresh
    │   ├── express-rate-limit (100 per 15 min)
    │   ├── express.json()
    │   └── Controller → Auth service
    │       ├── cookie-parser → req.cookies.refreshToken
    │       ├── SHA-256 hash → find token in DB
    │       ├── Theft detection (consumed token reuse)
    │       ├── Prisma $transaction (consume old, create new, link)
    │       └── jsonwebtoken sign (new access token)
    │
    ├── POST /api/auth/logout
    │   ├── express-rate-limit (100 per 15 min)
    │   └── Controller → revoke session + clear cookie
    │
    ├── POST /api/auth/logout-all
    │   ├── express-rate-limit (100 per 15 min)
    │   └── Controller → revoke all user sessions + clear cookie
    │
    └── GET /api/auth/protected (test endpoint)
        └── authenticateToken middleware
            ├── Bearer header → jsonwebtoken verify
            └── DB check: user exists, email verified, session valid

                    ▼ Database layer ▼
            Prisma Client → PrismaPg → pg Pool → PostgreSQL
```

## Installed but not currently used

These packages appear in [`backend/package.json`](../../backend/package.json) but do not participate in the current backend execution path:

| Package | Current status |
| --- | --- |
| `path` npm package | Installed, but [`app.js`](../../backend/src/app.js) imports Node's built-in `node:path`, and that import is itself currently unused. The npm polyfill is not the module being imported. |

Transitive dependencies are intentionally excluded. A package used internally by Prisma or Express is an implementation detail until Spotter imports or configures it directly.

## Dependency-placement findings

The handbook also records two runtime packages that are currently classified as development-only dependencies:

- `bcryptjs`
- `express-rate-limit`

Both are imported by production request code. A deployment that installs with `npm install --omit=dev` would not install them. No dependency file was changed while creating this handbook; the relevant guides identify the cleanup needed.

## Documentation convention

Each guide uses the following structure:

1. **What it is** — the technology's responsibility and boundary.
2. **How Spotter uses it** — files, configuration, and runtime sequence.
3. **API currently used** — the exact surface area already present in the code.
4. **What it can do next** — appropriate extensions, not claims about current behavior.
5. **Operational notes** — security, scaling, and maintenance concerns.
6. **Official references** — primary documentation for deeper study.
