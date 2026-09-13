# Exercises Module - Complete Architecture & Flow

This document details the architecture, taxonomy, catalog indexing, search capabilities, and endpoint structure of the **Exercises Module** (`/api/exercises`).

---

## 1. High-Level File Integration

```mermaid
graph TD
    A[src/app.js] -->|Mounts /api/exercises| B[src/modules/exercises/exercise.routes.js]
    B -->|1. Route Middleware| C[authenticateToken]
    C -->|2. Param & Query Validation| D[src/modules/exercises/exercise.validate.js]
    D -->|3. Route Handlers| E[src/modules/exercises/exercise.controller.js]
    E -->|4. Business Logic & Caching| F[src/modules/exercises/exercise.service.js]
    F -->|5. Static Catalog Enums| G[src/config/exercise.js]
    F -->|6. Database Query Builder| H[src/modules/exercises/exercise.repository.js]
    F -->|7. Response Shaping| I[src/modules/exercises/exercise.serializer.js]
```

---

## 2. Endpoints Overview

| Method | Endpoint | Purpose | Validation | Cache Policy |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/exercises/config` | Retrieve enum values, body parts, equipment, tracking metrics | None | `no-store` |
| `GET` | `/api/exercises` | Search and filter catalog with pagination | `listExercisesQuerySchema` | `no-store` |
| `GET` | `/api/exercises/:exerciseId` | Fetch detailed instructions and metadata for one exercise | `exerciseIdParamSchema` | `no-store` |

---

## 3. Data Model & Taxonomy

The exercise catalog is a curated, system-managed database table (`exercises`) with strict taxonomy:

### A. Core Attributes
* **`exerciseType`**: `WEIGHT_REPS`, `BODYWEIGHT_REPS`, `WEIGHT_DISTANCE`, `DISTANCE_TIME`, `REPS_TIME`, `TIME_ONLY`
* **`bodyPart`**: `CHEST`, `BACK`, `SHOULDERS`, `UPPER_ARMS`, `FOREARMS`, `UPPER_LEGS`, `LOWER_LEGS`, `WAIST`, `CARDIO`, `NECK`
* **`difficulty`**: `BEGINNER`, `INTERMEDIATE`, `EXPERT`
* **`equipment`**: `BARBELL`, `DUMBBELL`, `CABLE`, `MACHINE`, `BODY_WEIGHT`, `KETTLEBELL`, `BAND`, `SMITH_MACHINE`, etc.
* **`trackingMetrics`**: Array of measurement columns that workouts must track for this exercise (e.g. `["SETS", "REPS", "WEIGHT_KG"]`).
* **`gifPublicId`**: Cloudinary public ID for animated exercise demonstrations.

---

## 4. Query & Filter Architecture

The repository dynamically constructs Prisma search conditions combining text matching and faceted filters:

```javascript
// Case-insensitive name or slug search:
if (search) {
  where.OR = [
    { name: { contains: search, mode: "insensitive" } },
    { slug: { contains: search, mode: "insensitive" } },
  ];
}
// Faceted taxonomy filters (combined via AND):
if (bodyPart) where.bodyPart = bodyPart;
if (difficulty) where.difficulty = difficulty;
if (equipment) where.equipment = equipment;
```

---

## 5. Serializer Contract

* **`serializeExerciseSummary`**: Returns lightweight catalog metadata optimized for search dropdowns and lists (`id`, `name`, `slug`, `bodyPart`, `equipment`, `trackingMetrics`, `gifPublicId`).
* **`serializeExerciseDetails`**: Includes full step-by-step instructions (`instructions: string[]`).

---

## 6. Request Sequences & Execution Flows

### A. `GET /api/exercises/config` (Get Exercise Taxonomy Enums)

```mermaid
sequenceDiagram
    autonumber
    actor Frontend
    participant Router as Express Router
    participant Auth as authenticateToken
    participant Controller as ExerciseController
    participant Service as ExerciseService

    Frontend->>Router: GET /api/exercises/config (Bearer Token)
    Router->>Auth: authenticateToken
    Auth->>Router: req.user
    Router->>Controller: getExerciseConfigController
    Controller->>Service: getExerciseConfig()
    Service-->>Controller: Static taxonomy enums & metric rules
    Controller-->>Frontend: 200 OK (config data)
```

### B. `GET /api/exercises` (Search & Filter Catalog)

```mermaid
sequenceDiagram
    autonumber
    actor Frontend
    participant Router as Express Router
    participant Auth as authenticateToken
    participant Validator as Zod Query Validator
    participant Controller as ExerciseController
    participant Service as ExerciseService
    participant Repo as ExerciseRepository
    participant DB as PostgreSQL

    Frontend->>Router: GET /api/exercises?search=bench&bodyPart=CHEST&page=1&limit=20 (Bearer Token)
    Router->>Auth: authenticateToken
    Auth->>Router: req.user
    Router->>Validator: validateQuery(listExercisesQuerySchema)
    Validator->>Router: req.validatedQuery
    Router->>Controller: listExercisesController
    Controller->>Service: listExercises(query)
    Service->>Repo: findExercises(query)
    Repo->>DB: SELECT & COUNT exercises WHERE isActive=true
    DB-->>Repo: Exercise records + total count
    Repo-->>Service: { exercises, totalItems }
    Service-->>Controller: Paginated exercise summaries & metadata
    Controller-->>Frontend: 200 OK (paginated results)
```

### C. `GET /api/exercises/:exerciseId` (Exercise Details)

```mermaid
sequenceDiagram
    autonumber
    actor Frontend
    participant Router as Express Router
    participant Auth as authenticateToken
    participant Validator as Zod Params Validator
    participant Controller as ExerciseController
    participant Service as ExerciseService
    participant Repo as ExerciseRepository
    participant DB as PostgreSQL

    Frontend->>Router: GET /api/exercises/:exerciseId (Bearer Token)
    Router->>Auth: authenticateToken
    Auth->>Router: req.user
    Router->>Validator: validateParams(exerciseIdParamSchema)
    Validator->>Router: req.validatedParams
    Router->>Controller: getExerciseByIdController
    Controller->>Service: getExerciseById(exerciseId)
    Service->>Repo: findActiveExerciseById(exerciseId)
    Repo->>DB: SELECT exercise WHERE id=exerciseId AND isActive=true
    DB-->>Repo: Exercise details with instructions
    Repo-->>Service: Exercise record
    Service-->>Controller: Serialized exercise details
    Controller-->>Frontend: 200 OK (exercise details)
```

