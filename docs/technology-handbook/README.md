# Spotter Backend Technology Handbook

This handbook documents the technologies that the current Spotter backend actually uses. It is written around the repository rather than as a generic package list: every guide explains the technology, identifies the relevant Spotter files, describes the current request flow, and outlines reasonable next uses.

## Runtime snapshot

The versions below were observed in the local project on 2026-08-21.

| Technology | Installed version | Role in Spotter |
| --- | ---: | --- |
| [Node.js and ES modules](./nodejs-esm/README.md) | Node.js 24.18.0 | JavaScript runtime and module system |
| [Express](./express/README.md) | 5.2.1 | HTTP application, routers, middleware, and responses |
| [express-rate-limit](./express-rate-limit/README.md) | 8.6.2 | Signup abuse protection |
| [Zod](./zod/README.md) | 4.4.3 | Request-body validation and transformation |
| [bcryptjs](./bcryptjs/README.md) | 3.0.3 | Password hashing |
| [Node.js Crypto](./node-crypto/README.md) | Built into Node.js | Verification-token generation and SHA-256 hashing |
| [Nodemailer](./nodemailer/README.md) | 9.0.5 | Verification-email delivery through Gmail |
| [Prisma ORM](./prisma/README.md) | 7.9.1 | Schema, generated client, queries, and database errors |
| [PostgreSQL, `pg`, and PrismaPg](./postgresql-pg/README.md) | `pg` 8.23.0; adapter 7.9.1 | Persistent storage and database connectivity |
| [Environment variables and dotenv](./dotenv/README.md) | dotenv 17.4.2, currently transitive | Local configuration and secret loading |
| [Nodemon](./nodemon/README.md) | 3.1.14 | Automatic development-server restarts |

## Signup stack at a glance

```text
Node.js
└── Express application
    └── POST /api/auth/signup
        ├── express-rate-limit
        ├── express.json()
        ├── Zod validation
        └── Controller
            └── Auth service
                ├── bcryptjs password hash
                ├── Node Crypto verification token
                ├── Prisma Client
                │   └── PrismaPg → pg Pool → PostgreSQL
                └── Nodemailer → Gmail SMTP
```

## Installed but not currently used

These packages appear in [`backend/package.json`](../../backend/package.json) but do not participate in the current backend execution path:

| Package | Current status |
| --- | --- |
| `jsonwebtoken` | Installed, but no source file imports it and signup does not issue tokens. Document it when login/session work begins. |
| `bcrypt` | Installed, but the service imports `bcryptjs`. Keeping both usually adds confusion; choose one before production. |
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
