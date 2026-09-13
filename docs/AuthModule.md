# Authentication Module - Complete Architecture & Flow

This document details the security model, session management, token lifecycles, and endpoint architecture of the **Authentication Module** (`/api/auth`).

---

## 1. High-Level File Integration

```mermaid
graph TD
    A[src/app.js] -->|Mounts /api/auth| B[src/modules/auth/auth.routes.js]
    B -->|1. Endpoint-Specific Rate Limiters| C[src/middlewares/rateLimiter.js]
    C -->|2. Request Body Validation| D[src/modules/auth/auth.validation.js]
    D -->|3. Route Controllers| E[src/modules/auth/auth.controller.js]
    E -->|4. Business Logic & Security Engine| F[src/modules/auth/auth.service.js]
    F -->|5. Password Hashing| G[bcryptjs]
    F -->|6. Token Generation & Verification| H[src/modules/auth/auth.tokens.js & jsonwebtoken]
    F -->|7. Async Email Queue| I[src/queues/email.queue.js & pg-boss]
    F -->|8. Database Persistence| J[src/modules/auth/repositories/*]
```

---

## 2. Endpoints Overview

| Method | Endpoint | Rate Limit | Purpose | Security Features |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/signup` | 5 / 15m | Register account | Password hashing (bcrypt 12 rounds), transactional email queue dispatch |
| `POST` | `/api/auth/verify-email` | 30 / 15m | Confirm email token | One-time token consumption, marks `emailVerifiedAt` |
| `POST` | `/api/auth/resend-verification` | 5 / 15m | Resend confirmation link | Cooldown protection, queue encryption |
| `POST` | `/api/auth/login` | 10 / 15m | Authenticate credentials | Timing-attack resistant dummy hash, issues access token + httpOnly refresh cookie |
| `POST` | `/api/auth/refresh` | 100 / 15m | Rotate refresh token | Single-use rotation, token reuse theft detection, revokes compromised session trees |
| `POST` | `/api/auth/logout` | 100 / 15m | Terminate active session | Clears `refreshToken` cookie, marks session revoked |
| `POST` | `/api/auth/logout-all` | 100 / 15m | Revoke all user sessions | Invalidate all session records across all devices |
| `GET` | `/api/auth/me` | Standard | Retrieve active user identity | Validates Bearer access token |

---

## 3. Core Security Mechanisms

### A. Refresh Token Rotation & Theft Detection
* Refresh tokens are stored in the database hashed via SHA-256 (`tokenHash`).
* When `/api/auth/refresh` is called:
  1. The existing token is marked `consumedAt: new Date()`.
  2. A new refresh token is generated and linked via `replacedByTokenId`.
  3. A new JWT access token is signed and returned.
* **Reuse Detection**: If a client attempts to use an already-consumed refresh token, the server identifies this as a potential token theft, immediately revokes **all** active sessions for that user, and returns `401 REFRESH_TOKEN_THEFT_DETECTED`.

### B. Anti-Timing Password Verification
To prevent email enumeration via timing side-channels, `login` runs a dummy `bcrypt.compare` against a precomputed static hash when an email is not found in the database.

### C. Background Job Queue (pg-boss + AES-256-GCM)
Verification emails are not sent synchronously during HTTP requests. Instead, an encrypted job payload is queued within the same PostgreSQL transaction that creates the user account, ensuring zero orphan accounts or dropped emails.

---

## 4. Request Sequences & Execution Flows

### A. `POST /api/auth/signup` (Register Account)

```mermaid
sequenceDiagram
    autonumber
    actor Frontend
    participant Router as Express Router
    participant Limiter as RateLimiter (5/15m)
    participant Validator as Zod Validator
    participant Controller as AuthController
    participant Service as AuthService
    participant Worker as email.worker.js
    participant DB as PostgreSQL

    Frontend->>Router: POST /api/auth/signup (body: { email, password })
    Router->>Limiter: Check rate limit
    Limiter->>Router: Allow
    Router->>Validator: validateBody(signupSchema)
    Validator->>Router: req.validatedBody
    Router->>Controller: signupController
    Controller->>Service: signupUser(data)
    Service->>Service: bcrypt.hash(password, 12) & crypto.randomBytes(token)
    Service->>DB: Transaction: createUser + pg-boss send(send-verification-email)
    DB-->>Service: User created & job queued
    Service-->>Controller: { user, message }
    Controller-->>Frontend: 201 Created (registration confirmation)
    DB->>Worker: Dequeue email job (pg-boss work)
    Worker->>Worker: Decrypt AES-256-GCM & Nodemailer SMTP send
```

### B. `POST /api/auth/login` (User Login & Token Issuance)

```mermaid
sequenceDiagram
    autonumber
    actor Frontend
    participant Router as Express Router
    participant Limiter as RateLimiter (10/15m)
    participant Validator as Zod Validator
    participant Controller as AuthController
    participant Service as AuthService
    participant DB as PostgreSQL

    Frontend->>Router: POST /api/auth/login (body: { email, password })
    Router->>Limiter: Check rate limit
    Limiter->>Router: Allow
    Router->>Validator: validateBody(loginSchema)
    Validator->>Router: req.validatedBody
    Router->>Controller: loginController
    Controller->>Service: loginUser(data, ip, userAgent)
    Service->>DB: Find user by email
    DB-->>Service: User entity with passwordHash
    Service->>Service: bcrypt.compare(password, passwordHash)
    Service->>DB: Transaction: create session + insert refreshTokenHash
    DB-->>Service: Session created
    Service->>Service: Sign JWT accessToken (15m expiration)
    Service-->>Controller: { accessToken, refreshToken, user }
    Controller->>Controller: Set-Cookie: refreshToken (httpOnly, secure, sameSite)
    Controller-->>Frontend: 200 OK ({ accessToken, user })
```

### C. `POST /api/auth/refresh` (Token Rotation & Theft Detection)

```mermaid
sequenceDiagram
    autonumber
    actor Frontend
    participant Router as Express Router
    participant Limiter as RateLimiter (100/15m)
    participant Controller as AuthController
    participant Service as AuthService
    participant DB as PostgreSQL

    Frontend->>Router: POST /api/auth/refresh (Cookie: refreshToken)
    Router->>Limiter: Check rate limit
    Limiter->>Router: Allow
    Router->>Controller: refreshController
    Controller->>Service: rotateRefreshToken(cookieToken)
    Service->>Service: hash(cookieToken)
    Service->>DB: Find refresh token by hash
    DB-->>Service: Token record

    alt Token is already consumed (Theft Detected!)
        Service->>DB: Revoke ALL active sessions for user
        Service-->>Controller: Throw theftTriggerError
        Controller-->>Frontend: 401 Unauthorized (REFRESH_TOKEN_THEFT_DETECTED)
    else Token is valid & unconsumed
        Service->>DB: Transaction: mark old token consumed + insert new refreshToken + link replacedBy
        DB-->>Service: New token entity
        Service->>Service: Sign new JWT accessToken
        Service-->>Controller: { accessToken, newRefreshToken }
        Controller->>Controller: Set-Cookie: new refreshToken
        Controller-->>Frontend: 200 OK ({ accessToken })
    end
```

### D. `POST /api/auth/logout` (Revoke Session)

```mermaid
sequenceDiagram
    autonumber
    actor Frontend
    participant Router as Express Router
    participant Limiter as RateLimiter (100/15m)
    participant Controller as AuthController
    participant Service as AuthService
    participant DB as PostgreSQL

    Frontend->>Router: POST /api/auth/logout (Cookie: refreshToken)
    Router->>Limiter: Check rate limit
    Limiter->>Router: Allow
    Router->>Controller: logoutController
    Controller->>Service: logoutUser(cookieToken)
    Service->>DB: Revoke session matching token
    DB-->>Service: Success
    Controller->>Controller: Clear-Cookie: refreshToken
    Controller-->>Frontend: 200 OK ({ message: "Logged out successfully." })
```

