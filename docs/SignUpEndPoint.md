# POST /api/auth/signup - Complete Architecture & Flow

This document details the complete end-to-end architecture, rate-limiting, transactional queue dispatch, and security model of the **Signup Endpoint** (`POST /api/auth/signup`).

---

## 1. High-Level File Integration

```mermaid
graph TD
    A[src/app.js] -->|Mounts /api/auth| B[src/modules/auth/auth.routes.js]
    B -->|1. Protect (5 req / 15m)| C[src/middlewares/rateLimiter.js]
    C -->|2. Parse JSON| D[express.json]
    D -->|3. Validate Schema| E[src/middlewares/validatebody.js]
    E -->|4. HTTP Handler| F[src/modules/auth/auth.controller.js]
    F -->|5. Business Logic & Encryption| G[src/modules/auth/auth.service.js]
    G -->|6. Transactional Database & Queue| H[src/modules/auth/repositories/user.repository.js & pg-boss]
    H -.->|7. Async Worker Processing| I[src/workers/email.worker.js]
```

---

## 2. Detailed Pipeline & Component Responsibilities

### A. The Router Setup (`auth.routes.js`)
* Mounts `POST /signup` with strict middleware ordering:
  1. `signupRateLimiter`: Limits abuse per IP.
  2. `express.json({ limit: "100kb" })`: Parses incoming JSON body safely.
  3. `validateBody(signupSchema)`: Validates format before controller execution.
  4. `signupController`: Dispatches execution to the service layer.

### B. The Rate Limiter (`middlewares/rateLimiter.js`)
* Configured via `express-rate-limit` with a strict window of **5 attempts per 15 minutes** per IP address.
* Responds with `429 Too Many Requests` (`TOO_MANY_REQUESTS`) to protect the database and password hashing CPU resources against brute-force attacks.

### C. The Validator (`middlewares/validatebody.js`)
* Enforces `signupSchema`:
  * `email`: Standardized format, normalized to lowercase, trimmed, maximum 254 characters.
  * `password`: Minimum 8 characters, maximum 72 characters (preventing bcrypt truncation attacks), requiring complexity.
* Returns `400 Bad Request` with structured field issues if validation fails.

### D. The Controller (`auth.controller.js`)
* Extracts validated parameters and client metadata (`req.ip`, `req.headers["user-agent"]`).
* Invokes `authService.signup(req.validatedBody)`.
* Returns `201 Created` with confirmation metadata.

### E. The Service Layer (`auth.service.js`)
* **Password Hashing**: Hashes plaintext password using `bcryptjs` with `SALT_ROUNDS = 12`.
* **Verification Token**: Generates 32-byte cryptographic token using `node:crypto.randomBytes(32)` and computes its SHA-256 hash for database storage.
* **Payload Encryption**: Encrypts the raw verification token and recipient email using **AES-256-GCM** before pushing to the job queue.
* **Transactional Dispatch**: Dispatches user creation and `pg-boss` background job creation inside the **same database transaction** (`prisma.$transaction`).

### F. The Repository Layer (`repositories/user.repository.js`)
* Inserts the new `User` record into PostgreSQL.
* Catches Prisma `P2002` unique constraint violations and throws `DuplicateUserError` (HTTP 409).

### G. The Background Worker (`email.worker.js`)
* Runs in a separate process listening to the `send-verification-email` queue in `pg-boss`.
* Decrypts the AES-256-GCM payload and dispatches the HTML email via `nodemailer` using Gmail SMTP.
* Provides automatic retries and exponential backoff without blocking HTTP response times.

---

## 3. How Edge Cases Are Handled

1. **Duplicate Account Creation (Race Conditions)**:
   * Two simultaneous signups with the same email collide at PostgreSQL's unique index constraint (`users_email_key`). The repository intercepts `P2002` and throws `DuplicateUserError` (409 Conflict).
2. **Email Server Outages**:
   * Because email delivery is decoupled via `pg-boss`, temporary SMTP downtime or rate-limits do not fail the user's registration. The job persists in PostgreSQL and is retried automatically.
3. **Password Truncation Vulnerabilities**:
   * Bcrypt operates on a 72-byte limit. `signupSchema` limits passwords to 72 characters, preventing silent trailing-character truncation.
