# Workouts Module - Complete Architecture & Flow

This document details the workout lifecycle, concurrency guards, server-owned duration calculations, and endpoint structure of the **Workouts Module** (`/api/workouts`).

---

## 1. High-Level File Integration

```mermaid
graph TD
    A[src/app.js] -->|Mounts /api/workouts| B[src/modules/workouts/workout.routes.js]
    B -->|1. Route Middleware| C[express.json & authenticateToken]
    C -->|2. Param, Query & Body Validation| D[src/modules/workouts/workout.validate.js]
    D -->|3. Route Handlers| E[src/modules/workouts/workout.controller.js]
    E -->|4. Business Rules & State Transitions| F[src/modules/workouts/workout.service.js]
    F -->|5. Database Operations| G[src/modules/workouts/workout.repository.js]
    F -->|6. Contract Serialization| H[src/modules/workouts/workout.serializer.js]
```

---

## 2. Endpoints Overview

| Method | Endpoint | Allowed State | Purpose | Validation |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/workouts` | No active workout | Start a new in-progress workout session | `createWorkoutSchema` |
| `GET` | `/api/workouts/active` | `IN_PROGRESS` | Retrieve current active workout + exercises | None |
| `GET` | `/api/workouts/history` | `COMPLETED` | List completed workouts (paginated, date filters) | `workoutHistoryQuerySchema` |
| `GET` | `/api/workouts/:workoutId` | All | Fetch specific workout details | `workoutIdParamSchema` |
| `PATCH` | `/api/workouts/:workoutId` | `IN_PROGRESS` | Update workout name, notes, or rating | `workoutIdParamSchema` + `updateWorkoutSchema` |
| `POST` | `/api/workouts/:workoutId/complete` | `IN_PROGRESS` | Complete session (calculates duration, requires completed exercise) | `workoutIdParamSchema` + `workoutActionSchema` |
| `POST` | `/api/workouts/:workoutId/cancel` | `IN_PROGRESS` | Cancel and discard active workout | `workoutIdParamSchema` + `workoutActionSchema` |

---

## 3. Workout Lifecycle & Concurrency Guard

Workouts enforce a strict one-active-workout rule:

```text
               ┌───────────────┐
               │  IN_PROGRESS  │
               └───────┬───────┘
                       │
          ┌────────────┴────────────┐
          │                         │
   completeWorkout()          cancelWorkout()
          │                         │
          ▼                         ▼
   ┌─────────────┐           ┌─────────────┐
   │  COMPLETED  │           │  CANCELLED  │
   └─────────────┘           └─────────────┘
```

1. **Active Workout Guard**: A user cannot start a new workout if a workout with status `IN_PROGRESS` already exists. Returns `409 ACTIVE_WORKOUT_EXISTS`.
2. **Server-Owned Duration**: The client never submits elapsed time directly. On completion:
   ```javascript
   const completedAt = new Date();
   const elapsedMs = completedAt.getTime() - current.startedAt.getTime();
   const durationMinutes = Math.max(1, Math.ceil(elapsedMs / 60_000));
   ```
3. **Completion Precondition**: A workout cannot be marked completed unless at least one exercise has `completed: true`. Returns `409 WORKOUT_COMPLETION_REQUIRED`.

---

## 4. Request Sequences & Execution Flows

### A. `POST /api/workouts` (Start Workout)

```mermaid
sequenceDiagram
    autonumber
    actor Frontend
    participant Router as Express Router
    participant Auth as authenticateToken
    participant Validator as Zod Body Validator
    participant Controller as WorkoutController
    participant Service as WorkoutService
    participant Repo as WorkoutRepository
    participant DB as PostgreSQL

    Frontend->>Router: POST /api/workouts (Bearer Token, body: { name, startedAt, notes })
    Router->>Auth: authenticateToken
    Auth->>Router: req.user
    Router->>Validator: validateBody(createWorkoutSchema)
    Validator->>Router: req.validatedBody
    Router->>Controller: createWorkoutController
    Controller->>Service: createWorkout(userId, data)
    Service->>Repo: findActiveWorkoutByUserId(userId)
    Repo->>DB: SELECT workout WHERE userId=userId AND status='IN_PROGRESS'
    DB-->>Repo: null
    Service->>Repo: insertWorkout(userId, data)
    Repo->>DB: INSERT into workouts (status='IN_PROGRESS')
    DB-->>Repo: Created workout
    Repo-->>Service: Workout entity
    Service-->>Controller: Serialized workout (empty exercises: [])
    Controller-->>Frontend: 201 Created (workout data)
```

### B. `GET /api/workouts/active` (Get In-Progress Workout)

```mermaid
sequenceDiagram
    autonumber
    actor Frontend
    participant Router as Express Router
    participant Auth as authenticateToken
    participant Controller as WorkoutController
    participant Service as WorkoutService
    participant Repo as WorkoutRepository
    participant DB as PostgreSQL

    Frontend->>Router: GET /api/workouts/active (Bearer Token)
    Router->>Auth: authenticateToken
    Auth->>Router: req.user
    Router->>Controller: getActiveWorkoutController
    Controller->>Service: getActiveWorkout(userId)
    Service->>Repo: findActiveWorkoutDetailsByUserId(userId)
    Repo->>DB: SELECT workout with exercises & catalog relations WHERE status='IN_PROGRESS'
    DB-->>Repo: Active workout entity (or null)
    Repo-->>Service: Active workout entity
    Service-->>Controller: Serialized active workout (or null)
    Controller-->>Frontend: 200 OK (active workout)
```

### C. `POST /api/workouts/:workoutId/complete` (Complete Workout)

```mermaid
sequenceDiagram
    autonumber
    actor Frontend
    participant Router as Express Router
    participant Auth as authenticateToken
    participant Validator as Zod Validator
    participant Controller as WorkoutController
    participant Service as WorkoutService
    participant Repo as WorkoutRepository
    participant DB as PostgreSQL

    Frontend->>Router: POST /api/workouts/:workoutId/complete (Bearer Token, body: { notes, rating })
    Router->>Auth: authenticateToken
    Auth->>Router: req.user
    Router->>Validator: validateParams & validateBody
    Validator->>Router: req.validatedParams & req.validatedBody
    Router->>Controller: completeWorkoutController
    Controller->>Service: completeWorkout(userId, workoutId)
    Service->>Repo: findWorkoutByIdForUser(workoutId, userId)
    Repo->>DB: SELECT workout with exercises
    DB-->>Repo: Workout entity
    Service->>Service: Verify at least one exercise completed
    Service->>Service: Derive durationMinutes from (now - startedAt)
    Service->>Repo: completeActiveWorkout(workoutId, userId, { completedAt, durationMinutes })
    Repo->>DB: UPDATE workouts SET status='COMPLETED', durationMinutes=calc
    DB-->>Repo: Completed workout entity
    Repo-->>Service: Completed workout entity
    Service-->>Controller: Serialized completed workout
    Controller-->>Frontend: 200 OK (completed workout)
```

### D. `POST /api/workouts/:workoutId/cancel` (Cancel Workout)

```mermaid
sequenceDiagram
    autonumber
    actor Frontend
    participant Router as Express Router
    participant Auth as authenticateToken
    participant Validator as Zod Validator
    participant Controller as WorkoutController
    participant Service as WorkoutService
    participant Repo as WorkoutRepository
    participant DB as PostgreSQL

    Frontend->>Router: POST /api/workouts/:workoutId/cancel (Bearer Token)
    Router->>Auth: authenticateToken
    Auth->>Router: req.user
    Router->>Validator: validateParams & validateBody
    Validator->>Router: req.validatedParams & req.validatedBody
    Router->>Controller: cancelWorkoutController
    Controller->>Service: cancelWorkout(userId, workoutId)
    Service->>Repo: findWorkoutByIdForUser(workoutId, userId)
    Repo->>DB: SELECT workout (must be IN_PROGRESS)
    DB-->>Repo: Workout entity
    Service->>Repo: cancelActiveWorkout(workoutId, userId)
    Repo->>DB: UPDATE workouts SET status='CANCELLED', cancelledAt=now
    DB-->>Repo: Cancelled workout entity
    Repo-->>Service: Cancelled workout entity
    Service-->>Controller: Serialized cancelled workout
    Controller-->>Frontend: 200 OK (cancelled workout)
```

