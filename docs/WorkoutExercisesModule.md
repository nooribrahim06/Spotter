# Workout Exercises Module - Complete Architecture & Flow

This document details nested resource routing, measurement constraints against catalog tracking metrics, and exercise ordering for **Workout Exercises** (`/api/workouts/:workoutId/exercises`).

---

## 1. High-Level File Integration

```mermaid
graph TD
    A[src/app.js] -->|Mounts /api/workouts/:workoutId/exercises| B[src/modules/workout-exercises/workoutExercise.routes.js]
    B -->|1. Route Middleware| C[express.json & authenticateToken & mergeParams:true]
    C -->|2. Param & Body Validation| D[src/modules/workout-exercises/workoutExercise.validate.js]
    D -->|3. Route Handlers| E[src/modules/workout-exercises/workoutExercise.controller.js]
    E -->|4. Business Rules & Metric Assertions| F[src/modules/workout-exercises/workoutExercise.service.js]
    F -->|5. Metric Rule Validator| G[src/modules/workout-exercises/workoutExercise.rules.js]
    F -->|6. Atomic Transactions & Re-indexing| H[src/modules/workout-exercises/workoutExercise.repository.js]
    F -->|7. Contract Serialization| I[src/modules/workout-exercises/workoutExercise.serializer.js]
```

---

## 2. Endpoints Overview

All routes are nested under `/api/workouts/:workoutId/exercises`:

| Method | Endpoint | Purpose | Validation | Constraints |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/` | Add an exercise summary to active workout | `addWorkoutExerciseSchema` | Workout must be `IN_PROGRESS`, max 50 exercises, unique exercise per workout |
| `PATCH` | `/:workoutExerciseId` | Update sets, reps, load, or completion status | `updateWorkoutExerciseSchema` | Matches catalog `trackingMetrics` |
| `DELETE` | `/:workoutExerciseId` | Remove exercise from workout and re-index `exerciseOrder` | `workoutExerciseParamsSchema` | Atomic re-indexing |

---

## 3. Core Business Rules

1. **Catalog Metric Enforcement**:
   * The backend loads `exercise.trackingMetrics` from the database.
   * If an exercise tracks `["SETS", "REPS", "WEIGHT_KG"]`, the client must supply non-null values for all three fields. Extra unconfigured metrics are rejected.
2. **Exercise Ordering (`exerciseOrder`)**:
   * `exerciseOrder` is 100% server-managed.
   * Adding a new exercise assigns `max(exerciseOrder) + 1`.
   * Deleting an exercise decrements `exerciseOrder` for all subsequent exercises within a database transaction:
     ```sql
     UPDATE workout_exercises
     SET exercise_order = exercise_order - 1
     WHERE workout_id = $1 AND exercise_order > $2;
     ```
3. **Immutability of Finished Workouts**:
   * No exercise can be added, modified, or deleted once a workout is `COMPLETED` or `CANCELLED`.

---

## 4. Request Sequences & Execution Flows

### A. `POST /api/workouts/:workoutId/exercises` (Add Exercise)

```mermaid
sequenceDiagram
    autonumber
    actor Frontend
    participant Router as Express Router
    participant Auth as authenticateToken
    participant Validator as Zod Validator
    participant Controller as WorkoutExerciseController
    participant Service as WorkoutExerciseService
    participant Repo as WorkoutExerciseRepository
    participant DB as PostgreSQL

    Frontend->>Router: POST /api/workouts/:workoutId/exercises (Bearer Token, body: { exerciseId, sets, reps, weightKg })
    Router->>Auth: authenticateToken
    Auth->>Router: req.user
    Router->>Validator: validateParams & validateBody
    Validator->>Router: req.validatedParams & req.validatedBody
    Router->>Controller: addWorkoutExerciseController
    Controller->>Service: addWorkoutExercise(userId, workoutId, input)
    Service->>Repo: findOwnedWorkoutIdentity(workoutId, userId)
    Repo->>DB: SELECT status WHERE id=workoutId (must be IN_PROGRESS)
    DB-->>Repo: Status ok
    Service->>Repo: findActiveExerciseIdentity(input.exerciseId)
    Repo->>DB: SELECT trackingMetrics FROM exercises WHERE id=exerciseId
    DB-->>Repo: Catalog metrics
    Service->>Service: Assert measurements match catalog trackingMetrics
    Service->>Repo: addWorkoutExercise(workoutId, userId, input)
    Repo->>DB: Transaction: verify unique, max(exerciseOrder)+1, INSERT
    DB-->>Repo: Inserted workout exercise
    Repo-->>Service: { outcome: "SUCCESS", workoutExercise }
    Service-->>Controller: Serialized workout exercise
    Controller-->>Frontend: 201 Created (workout exercise data)
```

### B. `PATCH /api/workouts/:workoutId/exercises/:workoutExerciseId` (Update Sets / Completed)

```mermaid
sequenceDiagram
    autonumber
    actor Frontend
    participant Router as Express Router
    participant Auth as authenticateToken
    participant Validator as Zod Validator
    participant Controller as WorkoutExerciseController
    participant Service as WorkoutExerciseService
    participant Repo as WorkoutExerciseRepository
    participant DB as PostgreSQL

    Frontend->>Router: PATCH /api/workouts/:workoutId/exercises/:id (Bearer Token, body: { sets, reps, weightKg, completed })
    Router->>Auth: authenticateToken
    Auth->>Router: req.user
    Router->>Validator: validateParams & validateBody
    Validator->>Router: req.validatedParams & req.validatedBody
    Router->>Controller: updateWorkoutExerciseController
    Controller->>Service: updateWorkoutExercise(userId, workoutId, workoutExerciseId, input)
    Service->>Repo: findOwnedWorkoutIdentity(workoutId, userId)
    Repo->>DB: SELECT status WHERE id=workoutId (IN_PROGRESS)
    DB-->>Repo: Status ok
    Service->>Repo: findWorkoutExerciseWithCatalogMetrics(workoutExerciseId, workoutId, userId)
    Repo->>DB: SELECT workoutExercise JOIN exercises
    DB-->>Repo: Record with tracking metrics
    Service->>Service: Assert updated measurements match tracking metrics
    Service->>Repo: updateWorkoutExercise(workoutExerciseId, workoutId, userId, input)
    Repo->>DB: UPDATE workout_exercises SET sets=..., reps=..., completed=...
    DB-->>Repo: Updated row
    Repo-->>Service: { outcome: "SUCCESS", workoutExercise }
    Service-->>Controller: Serialized workout exercise
    Controller-->>Frontend: 200 OK (updated workout exercise)
```

### C. `DELETE /api/workouts/:workoutId/exercises/:workoutExerciseId` (Delete & Re-Index Order)

```mermaid
sequenceDiagram
    autonumber
    actor Frontend
    participant Router as Express Router
    participant Auth as authenticateToken
    participant Validator as Zod Validator
    participant Controller as WorkoutExerciseController
    participant Service as WorkoutExerciseService
    participant Repo as WorkoutExerciseRepository
    participant DB as PostgreSQL

    Frontend->>Router: DELETE /api/workouts/:workoutId/exercises/:id (Bearer Token)
    Router->>Auth: authenticateToken
    Auth->>Router: req.user
    Router->>Validator: validateParams(workoutExerciseParamsSchema)
    Validator->>Router: req.validatedParams
    Router->>Controller: deleteWorkoutExerciseController
    Controller->>Service: deleteWorkoutExercise(userId, workoutId, workoutExerciseId)
    Service->>Repo: findOwnedWorkoutIdentity(workoutId, userId)
    Repo->>DB: SELECT status (must be IN_PROGRESS)
    DB-->>Repo: Status ok
    Service->>Repo: deleteWorkoutExercise(workoutExerciseId, workoutId, userId)
    Repo->>DB: Transaction: DELETE row & UPDATE exercise_order = exercise_order - 1
    DB-->>Repo: Success
    Repo-->>Service: { outcome: "SUCCESS" }
    Service-->>Controller: Success
    Controller-->>Frontend: 204 No Content
```

