# Progress Module - Complete Architecture & Flow

This document details the architecture, body state snapshotting, baseline vs check-in normalization, active goal linkage, and endpoint structure of the **Progress Module** (`/api/progress`).

---

## 1. High-Level File Integration

```mermaid
graph TD
    A[src/app.js] -->|Mounts /api/progress| B[src/modules/progress/progress.routes.js]
    B -->|1. Route Middleware| C[express.json & authenticateToken]
    C -->|2. Param, Query & Body Validation| D[src/modules/progress/progress.validate.js]
    D -->|3. Route Handlers| E[src/modules/progress/progress.controller.js]
    E -->|4. Business Rules & Goal Linkage| F[src/modules/progress/progress.service.js]
    F -->|5. Database Operations & Nested Writes| G[src/modules/progress/progress.repository.js]
    F -->|6. Contract Serialization| H[src/modules/progress/progress.serializer.js]
```

---

## 2. Endpoints Overview

| Method | Endpoint | Purpose | Validation | Cache Policy |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/progress` | Create a new body check-in (weight, metrics, circumferences) | `createProgressSchema` | `no-store` |
| `GET` | `/api/progress` | View paginated check-in history with optional date range | `progressHistoryQuerySchema` | `no-store` |
| `GET` | `/api/progress/latest` | Retrieve single most recent check-in snapshot | None | `no-store` |
| `GET` | `/api/progress/:entryId` | View details of a specific historical check-in | `progressEntryParamsSchema` | `no-store` |

---

## 3. Data Model Architecture

```text
┌─────────────────────────┐
│       BodyProfile       │
│ ─────────────────────── │
│ startingWeightKg (base) │
│ heightCm                │
│ birthDate               │
└────────────┬────────────┘
             │ 1 : N
             ▼
┌─────────────────────────┐         ┌─────────────────────────┐
│      ProgressEntry      │ ──────> │          Goal           │
│ ─────────────────────── │ (N : 1) │ ─────────────────────── │
│ weightKg (current snapshot)       │ targetWeightKg          │
│ bodyFatPercentage       │         │ status (ACTIVE)         │
│ skeletalMuscleMassKg    │         └─────────────────────────┘
│ restingHeartRateBpm     │
│ recordedAt              │
└────────────┬────────────┘
             │ 1 : N
             ▼
┌─────────────────────────┐
│   ProgressMeasurement   │
│ ─────────────────────── │
│ measurementType (WAIST) │
│ valueCm                 │
└─────────────────────────┘
```

### Architectural Principles:
1. **Immutable Baseline vs Snapshot History**:
   * `BodyProfile.startingWeightKg` is set once during onboarding and never updated.
   * Every new weigh-in or measurement is appended as a new `ProgressEntry`.
   * The latest `ProgressEntry` is read dynamically as the user's `currentBodyState`.
2. **Automatic Active Goal Tagging**:
   * When logging a check-in, the service checks if an `ACTIVE` goal exists and attaches `goalId: activeGoal.id`.
   * An initial check-in is flagged with `isInitialForGoal: true` to record starting weight for milestone calculations.
3. **Chronological Integrity**:
   * A check-in timestamp `recordedAt` cannot be in the future, and cannot be older than the newest recorded check-in for the user.

---

## 4. Request Sequences & Execution Flows

### A. `POST /api/progress` (Create Progress Check-In)

```mermaid
sequenceDiagram
    autonumber
    actor Frontend
    participant Router as Express Router
    participant Auth as authenticateToken
    participant Validator as Zod Body Validator
    participant Controller as ProgressController
    participant Service as ProgressService
    participant GoalRepo as GoalRepository
    participant ProgressRepo as ProgressRepository
    participant DB as PostgreSQL

    Frontend->>Router: POST /api/progress (Bearer Token, body: { weightKg, bodyFatPercentage, measurements, notes })
    Router->>Auth: authenticateToken
    Auth->>Router: req.user
    Router->>Validator: validateBody(createProgressSchema)
    Validator->>Router: req.validatedBody
    Router->>Controller: createProgressEntry
    Controller->>Service: createProgressEntry(validatedBody, userId)
    Service->>ProgressRepo: findLatestProgressEntryByUserId(userId)
    ProgressRepo->>DB: SELECT newest check-in
    DB-->>ProgressRepo: Latest check-in (or null)
    Service->>Service: Verify recordedAt >= latestEntry.recordedAt
    Service->>GoalRepo: findActiveGoalByUserId(userId)
    GoalRepo->>DB: SELECT goal WHERE userId=userId AND status='ACTIVE'
    DB-->>GoalRepo: Active goal entity (or null)
    Service->>ProgressRepo: createProgressEntry(data, userId) (links active goalId)
    ProgressRepo->>DB: INSERT progress_entries & nested progress_measurements
    DB-->>ProgressRepo: Created entry with measurements
    ProgressRepo-->>Service: Entry entity
    Service-->>Controller: Serialized progress check-in
    Controller-->>Frontend: 201 Created (check-in data)
```

### B. `GET /api/progress` (Paginated Check-In History)

```mermaid
sequenceDiagram
    autonumber
    actor Frontend
    participant Router as Express Router
    participant Auth as authenticateToken
    participant Validator as Zod Query Validator
    participant Controller as ProgressController
    participant Service as ProgressService
    participant ProgressRepo as ProgressRepository
    participant DB as PostgreSQL

    Frontend->>Router: GET /api/progress?page=1&limit=20&startDate=... (Bearer Token)
    Router->>Auth: authenticateToken
    Auth->>Router: req.user
    Router->>Validator: validateQuery(progressHistoryQuerySchema)
    Validator->>Router: req.validatedQuery
    Router->>Controller: getProgressHistory
    Controller->>Service: getProgressHistory(userId, query)
    Service->>ProgressRepo: findProgressHistoryByUserId(userId, query)
    ProgressRepo->>DB: SELECT & COUNT progress_entries with measurements (ORDER BY recordedAt DESC)
    DB-->>ProgressRepo: { progressEntries, totalItems }
    ProgressRepo-->>Service: { progressEntries, totalItems }
    Service-->>Controller: { items: serializedEntries, pagination }
    Controller-->>Frontend: 200 OK (paginated check-in history)
```

### C. `GET /api/progress/latest` (Latest Snapshot)

```mermaid
sequenceDiagram
    autonumber
    actor Frontend
    participant Router as Express Router
    participant Auth as authenticateToken
    participant Controller as ProgressController
    participant Service as ProgressService
    participant ProgressRepo as ProgressRepository
    participant DB as PostgreSQL

    Frontend->>Router: GET /api/progress/latest (Bearer Token)
    Router->>Auth: authenticateToken
    Auth->>Router: req.user
    Router->>Controller: getLatestProgressEntry
    Controller->>Service: getLatestProgressEntry(userId)
    Service->>ProgressRepo: findLatestProgressEntryByUserId(userId)
    ProgressRepo->>DB: SELECT newest check-in with measurements
    DB-->>ProgressRepo: Latest entry (or null)
    ProgressRepo-->>Service: Latest entry entity
    Service-->>Controller: Serialized progress entry (or null)
    Controller-->>Frontend: 200 OK (latest check-in data)
```

