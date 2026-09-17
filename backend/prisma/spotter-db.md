# Spotter Database

<p align="center">
  <img src="docs/spotter-mascot.png" alt="Spotter" width="180" />
</p>

<p align="center">
  <strong>Database architecture for the Spotter fitness tracking platform.</strong><br/>
  Built with PostgreSQL, designed for performance, and documented for collaboration.
</p>

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Entity Relationship Diagram](#entity-relationship-diagram)
- [Schema Reference](#schema-reference)
  - [Auth and Identity](#group-1-auth--identity)
  - [User Profile and Body Data](#group-2-user-profile--body-data)
  - [Goals and Nutrition Targets](#group-3-goals--nutrition-targets)
  - [Plan Templates](#group-4-plan-templates)
  - [Reference Data](#group-5-reference-data-foods--exercises)
  - [Meal Tracking](#group-6-meal-tracking)
  - [Workout Tracking](#group-7-workout-tracking)
  - [Daily Summary](#group-8-daily-summary)
  - [AI Coach](#group-9-ai-coach)
  - [Audit Log](#group-10-audit-log)
- [Indexing Strategy](#indexing-strategy)
- [Database-Level Logic](#database-level-logic)
- [Data Sources and Seeding](#data-sources-and-seeding)

---

## Overview

Spotter is a fitness and nutrition tracking application with an integrated AI coach.
This repository contains the complete database layer: schema definitions, indexing
strategy, database-level logic (triggers, views), and seed data pipelines.

The database is designed to work alongside a Node.js/Express backend that uses
Prisma as its ORM for standard CRUD operations. Complex queries, performance
optimizations, and data integrity rules are handled at the database level using
raw SQL.

**Approach:** Hybrid (Prisma ORM for simple operations + Raw SQL for advanced logic).

## Tech Stack

| Component       | Technology                        |
|-----------------|-----------------------------------|
| Database        | PostgreSQL 16+                    |
| ORM             | Prisma (schema + basic CRUD)      |
| Advanced SQL    | Raw migrations (GIN, BRIN, Triggers) |
| Caching         | Redis (sessions, daily summary cache) |
| Search          | PostgreSQL Full-Text Search + pg_trgm |

---

## Entity Relationship Diagram

The full ERD covers 31 tables organized into 10 logical groups.

<p align="center">
  <img src="docs/erd.svg" alt="Spotter ERD" width="100%" />
</p>

---

## Schema Reference

Each table is documented with its columns, relationships, indexes, and design notes.

---

### GROUP 1: Auth & Identity

These tables are managed by the backend developer. They handle user registration,
email verification, session management, and token rotation.

---

#### `users`

The core account table. Every other table in the system references this one
directly or indirectly.

**Relationships:**
- One-to-One with `user_profiles`, `body_profiles`, `coaching_preferences`.
- One-to-Many with `auth_sessions`, `goals`, `nutrition_targets`, `user_plans`, `meal_logs`, `workout_logs`, `daily_summaries`, `ai_conversations`.

**Columns:**

- `id` — UUID, primary key.
- `email` — VarChar(254), unique. Stored lowercase.
- `username` — VarChar(30), unique. Stored lowercase.
- `password_hash` — VarChar(100). Bcrypt hash, never the raw password.
- `language` — VarChar(10), default `'en'`.
- `country` — VarChar(2), optional. ISO 3166-1 alpha-2 code.
- `role` — Enum (USER, COACH, ADMIN), default USER.
- `email_verified` — Boolean, default false.
- `verify_token` — VarChar(64), optional. SHA-256 hex hash.
- `verify_token_expires_at` — Timestamptz, optional.
- `onboarding_status` — Enum (NOT_STARTED, IN_PROGRESS, COMPLETED).
- `onboarding_step` — SmallInt, optional. Null after completion.
- `fitness_onboarding_completed_at` — Timestamptz, optional.
- `timezone` — VarChar(64), optional. IANA timezone (e.g. "Africa/Cairo").
- `created_at` — Timestamptz.
- `updated_at` — Timestamptz.

---

#### `auth_sessions`

One authenticated login per device. Revoking a session invalidates its
entire token family.

**Relationship:** Many-to-One with `users` (CASCADE on delete).

**Columns:**

- `id` — UUID, primary key.
- `user_id` — UUID, references `users.id`.
- `family_id` — UUID, unique. Groups tokens into one rotation chain.
- `created_at` — Timestamptz.
- `expires_at` — Timestamptz.
- `last_used_at` — Timestamptz, optional.
- `revoked_at` — Timestamptz, optional. Set when session is invalidated.
- `user_agent` — VarChar(512), optional.
- `ip_hash` — VarChar(64), optional. SHA-256 of IP, never raw IP.

**Indexes:**

| Column       | Type   | Reason                              |
|--------------|--------|-------------------------------------|
| `user_id`    | B-Tree | Find all sessions for a user        |
| `expires_at` | B-Tree | Cleanup job finds expired sessions  |
| `revoked_at` | B-Tree | Filter out revoked sessions quickly |

---

#### `refresh_tokens`

Hashed opaque refresh tokens. Raw tokens are never stored in the database.
Supports token rotation with theft detection.

**Relationship:** Many-to-One with `auth_sessions` (CASCADE on delete).

**Columns:**

- `id` — UUID, primary key.
- `session_id` — UUID, references `auth_sessions.id`.
- `token_hash` — VarChar(64), unique. SHA-256 hex.
- `created_at` — Timestamptz.
- `expires_at` — Timestamptz.
- `consumed_at` — Timestamptz, optional. Set after successful rotation.
- `revoked_at` — Timestamptz, optional.
- `replaced_by_token_id` — UUID, unique, optional. Points to the replacement token.

**Indexes:**

| Column       | Type   | Reason                            |
|--------------|--------|-----------------------------------|
| `session_id` | B-Tree | Find all tokens for a session     |
| `expires_at` | B-Tree | Cleanup expired tokens            |
| `revoked_at` | B-Tree | Filter revoked tokens             |

---

### GROUP 2: User Profile & Body Data

These tables store the user's identity, physical attributes, health conditions,
dietary preferences, and training baseline.

---

#### `user_profiles`

Public display identity. This is the only table that could be shared with
other users in a future social feature.

**Relationship:** One-to-One with `users` (CASCADE on delete).

**Columns:**

- `user_id` — UUID, primary key and foreign key.
- `first_name` — VarChar(40).
- `last_name` — VarChar(40).
- `display_name` — VarChar(50), optional.
- `bio` — VarChar(500), optional.
- `profile_photo_key` — VarChar(512), optional. Object storage key only.
- `created_at` — Timestamptz.
- `updated_at` — Timestamptz.

---

#### `body_profiles`

Private, stable physical facts used for calorie calculations and plan generation.
Current weight is not stored here; it lives in the latest `progress_entries` row.

**Relationships:**
- One-to-One with `users` (CASCADE on delete).
- One-to-One with `health_profiles`, `nutrition_profiles`, `training_profiles`.
- One-to-Many with `progress_entries`.

**Columns:**

- `user_id` — UUID, primary key and foreign key.
- `birth_date` — Date. Age is calculated at query time, never stored.
- `adult_confirmed_at` — Timestamptz. Audit proof of age confirmation.
- `sex_for_calculation` — Enum (MALE, FEMALE). For formulas only.
- `preferred_unit_system` — Enum (METRIC, IMPERIAL). Display preference.
- `height_cm` — Decimal(5,2). Always stored in metric.
- `starting_weight_kg` — Decimal(6,2). Immutable onboarding baseline.
- `activity_level` — Enum (SEDENTARY, LIGHTLY_ACTIVE, MODERATELY_ACTIVE, VERY_ACTIVE), optional.
- `created_at` — Timestamptz.
- `updated_at` — Timestamptz.

---

#### `health_profiles`

Private health and safety constraints. Uses JSONB for flexible storage.

**Relationship:** One-to-One with `body_profiles` (CASCADE on delete).

**Columns:**

- `body_profile_id` — UUID, primary key and foreign key.
- `health_conditions` — JSONB, optional.
- `movement_limitations` — JSONB, optional.
- `special_planning_states` — JSONB, optional.
- `requires_professional_clearance` — Boolean, default false.
- `safety_notes` — VarChar(2000), optional.
- `created_at` — Timestamptz.
- `updated_at` — Timestamptz.

---

#### `nutrition_profiles`

Dietary preferences, allergies, intolerances, and practical constraints.

**Relationship:** One-to-One with `body_profiles` (CASCADE on delete).

**Columns:**

- `body_profile_id` — UUID, primary key and foreign key.
- `dietary_preference_codes` — JSONB, optional. Array of codes (VEGAN, HALAL, etc.).
- `food_allergies` — JSONB, optional.
- `food_intolerances` — JSONB, optional.
- `food_preferences` — JSONB, optional.
- `meals_per_day` — SmallInt, optional.
- `snacks_per_day` — SmallInt, optional.
- `plan_style` — Enum (EXACT_MEALS, FLEXIBLE_MEALS, MACRO_BASED, SIMPLE_GUIDANCE), optional.
- `cooking_skill` — Enum (NONE, BASIC, INTERMEDIATE, ADVANCED), optional.
- `max_meal_prep_minutes` — SmallInt, optional.
- `kitchen_access` — Enum (NONE, MICROWAVE_ONLY, BASIC, FULL), optional.
- `food_budget_level` — Enum (LOW, MODERATE, FLEXIBLE), optional.
- `created_at` — Timestamptz.
- `updated_at` — Timestamptz.

---

#### `training_profiles`

Training experience, equipment availability, schedule, and recovery baseline.

**Relationship:** One-to-One with `body_profiles` (CASCADE on delete).

**Columns:**

- `body_profile_id` — UUID, primary key and foreign key.
- `overall_experience_level` — Enum (BEGINNER, INTERMEDIATE, ADVANCED), optional.
- `resistance_training_level` — Enum, optional.
- `cardio_training_level` — Enum, optional.
- `currently_training_consistently` — Boolean, optional.
- `training_days_per_week` — SmallInt, optional.
- `available_days` — JSONB, optional.
- `preferred_session_minutes` — SmallInt, optional.
- `training_environment` — Enum (COMMERCIAL_GYM, HOME_GYM, HOME_MINIMAL, OUTDOORS, MIXED), optional.
- `available_equipment` — JSONB, optional.
- `preferred_training_styles` — JSONB, optional.
- `preferred_cardio_type` — VarChar(100), optional.
- `average_sleep_minutes` — SmallInt, optional.
- `sleep_quality` — SmallInt, optional.
- `typical_stress_level` — SmallInt, optional.
- `created_at` — Timestamptz.
- `updated_at` — Timestamptz.

---

#### `coaching_preferences`

Controls how the AI coach communicates with each user.

**Relationship:** One-to-One with `users` (CASCADE on delete).

**Columns:**

- `user_id` — UUID, primary key and foreign key.
- `coaching_style` — Enum (SUPPORTIVE, BALANCED, DIRECT), default BALANCED.
- `explanation_level` — Enum (CONCISE, NORMAL, DETAILED), default NORMAL.
- `motivation_style` — Enum (ENCOURAGING, ACCOUNTABILITY, FACT_BASED, MINIMAL), optional.
- `checkin_frequency` — Enum (DAILY, FEW_TIMES_PER_WEEK, WEEKLY), optional.
- `proactive_coaching` — Boolean, default false.
- `workout_reminders` — Boolean, default false.
- `nutrition_reminders` — Boolean, default false.
- `created_at` — Timestamptz.
- `updated_at` — Timestamptz.

---

### GROUP 3: Goals & Nutrition Targets

---

#### `goals`

Fitness goals with lifecycle tracking. Only one goal per user can be
active at any time, enforced at the database level.

**Relationship:** One-to-Many with `users` (CASCADE on delete).

**Columns:**

- `id` — UUID, primary key.
- `user_id` — UUID, references `users.id`.
- `primary_goal_type` — Enum (LOSE_WEIGHT, MAINTAIN_WEIGHT, GAIN_WEIGHT, BUILD_MUSCLE, IMPROVE_FITNESS).
- `secondary_goal_type` — Enum, optional.
- `target_weight_kg` — Decimal(6,2), optional.
- `target_body_fat_percentage` — Decimal(5,2), optional.
- `target_date` — Date, optional.
- `desired_pace` — Enum (CONSERVATIVE, MODERATE, AGGRESSIVE), optional.
- `priority` — Enum (APPEARANCE, HEALTH, PERFORMANCE, STRENGTH, ENDURANCE), optional.
- `motivation_text` — Text, optional.
- `status` — Enum (DRAFT, ACTIVE, COMPLETED, CANCELLED), default DRAFT.
- `is_onboarding_goal` — Boolean, optional.
- `completed_at` — Timestamptz, optional.
- `created_at` — Timestamptz.
- `updated_at` — Timestamptz.

**Indexes:**

| Column/Expression                           | Type                  | Reason                                    |
|---------------------------------------------|-----------------------|-------------------------------------------|
| `user_id`                                   | B-Tree                | Find all goals for a user                 |
| `(user_id, status)`                         | B-Tree (Composite)    | Filter active/completed goals per user    |
| `user_id WHERE status = 'ACTIVE'`           | B-Tree (Partial, Unique) | Enforce one active goal per user (Raw SQL) |

---

#### `goal_measurement_targets`

Optional detailed body-measurement targets (e.g., target waist circumference).

**Relationship:** Many-to-One with `goals` (CASCADE on delete).

**Columns:**

- `id` — UUID, primary key.
- `goal_id` — UUID, references `goals.id`.
- `measurement_type` — Enum (WAIST, CHEST, HIPS, etc.).
- `target_value_cm` — Decimal(6,2). All values stored in cm.
- `created_at` — Timestamptz.

---

#### `goal_performance_targets`

Optional performance targets (e.g., 100kg bench press, 5km run under 25 mins).

**Relationships:**
- Many-to-One with `goals` (CASCADE on delete).
- Many-to-One with `exercises` (SET NULL on delete).

**Columns:**

- `id` — UUID, primary key.
- `goal_id` — UUID, references `goals.id`.
- `performance_type` — Enum (RUN_DISTANCE, EXERCISE_STRENGTH, REPETITIONS, etc.).
- `exercise_id` — UUID, optional. Linked to an exercise if applicable.
- `target_value` — Decimal(8,2).
- `target_unit` — VarChar(50).
- `description` — Text, optional.
- `created_at` — Timestamptz.

---

#### `user_goal_history_context`

Stores context about previous attempts for the active goal.

**Relationship:** One-to-One with `goals` (CASCADE on delete).

**Columns:**

- `id` — UUID, primary key.
- `goal_id` — UUID, references `goals.id`.
- `tried_before` — Boolean.
- `what_worked` — Text, optional.
- `what_did_not_work` — Text, optional.
- `created_at` — Timestamptz.
- `updated_at` — Timestamptz.

---

#### `nutrition_targets`

Stores the user's daily calorie and macronutrient targets linked to a specific goal.

**Relationship:** 
- Many-to-One with `users` (CASCADE on delete).
- Many-to-One with `goals` (CASCADE on delete).

**Columns:**

- `id` — UUID, primary key.
- `user_id` — UUID, references `users.id`.
- `goal_id` — UUID, references `goals.id`.
- `target_calories` — Int. Daily calorie goal.
- `target_protein` — Decimal(5,2). Grams per day.
- `target_carbs` — Decimal(5,2). Grams per day.
- `target_fat` — Decimal(5,2). Grams per day.
- `custom_targets` — Boolean, default false.
- `formula_used` — Enum (MIFFLIN_ST_JEOR, HARRIS_BENEDICT, CUSTOM).
- `created_at` — Timestamptz.
- `updated_at` — Timestamptz.

---

#### `progress_entries`

Body snapshots recorded over time. The most recent entry provides the
user's current weight. Linked to both `body_profiles` (owner) and
optionally to a `goal` (context).

**Relationships:**
- Many-to-One with `body_profiles` (CASCADE on delete).
- Many-to-One with `goals` (SET NULL on delete).
- One-to-Many with `progress_measurements`.

**Columns:**

- `id` — UUID, primary key.
- `body_profile_id` — UUID, references `body_profiles.user_id`.
- `goal_id` — UUID, optional. References `goals.id`.
- `recorded_at` — Timestamptz.
- `weight_kg` — Decimal(6,2). Main source of truth for current weight.
- `body_fat_percentage` — Decimal(5,2), optional.
- `skeletal_muscle_mass_kg` — Decimal(6,2), optional.
- `resting_heart_rate_bpm` — SmallInt, optional.
- `notes` — VarChar(1000), optional.
- `is_initial_for_goal` — Boolean, optional.
- `created_at` — Timestamptz.

---

#### `progress_measurements`

Individual body circumference measurements attached to a progress entry.

**Relationship:** Many-to-One with `progress_entries` (CASCADE on delete).

**Columns:**

- `id` — UUID, primary key.
- `progress_entry_id` — UUID, references `progress_entries.id`.
- `measurement_type` — Enum (WAIST, CHEST, HIPS, NECK, SHOULDERS, LEFT_UPPER_ARM, RIGHT_UPPER_ARM, LEFT_FOREARM, RIGHT_FOREARM, LEFT_THIGH, RIGHT_THIGH, LEFT_CALF, RIGHT_CALF, ABDOMEN).
- `value_cm` — Decimal(6,2).
- `created_at` — Timestamptz.

---

### GROUP 4: Plan Templates

These tables define static, pre-defined workout and nutrition plans (templates)
that can be assigned to users, avoiding the high cost and latency of on-the-fly AI generation.

---

#### `plan_templates`

The overarching template definition.

**Columns:**
- `id` — UUID, primary key.
- `name` — VarChar(255). (e.g., "Beginner Muscle Building 3-Day").
- `description` — Text.
- `goal_type` — Enum.
- `experience_level` — Enum.
- `duration_weeks` — SmallInt.
- `created_at` — Timestamptz.
- `updated_at` — Timestamptz.

---

#### `plan_template_days`

The days that make up a plan template.

**Relationship:** Many-to-One with `plan_templates` (CASCADE on delete).

**Columns:**
- `id` — UUID, primary key.
- `plan_template_id` — UUID, references `plan_templates.id`.
- `day_number` — SmallInt. (1 to 7).
- `name` — VarChar(100). (e.g., "Push Day").
- `notes` — Text.

---

#### `plan_template_exercises`

The actual exercises prescribed on a specific template day.

**Relationships:**
- Many-to-One with `plan_template_days` (CASCADE on delete).
- Many-to-One with `exercises`.

**Columns:**
- `id` — UUID, primary key.
- `plan_template_day_id` — UUID, references `plan_template_days.id`.
- `exercise_id` — UUID, references `exercises.id`.
- `exercise_order` — SmallInt.
- `target_sets` — SmallInt.
- `target_reps` — VarChar(50). (e.g., "8-12", "To failure").
- `rest_seconds` — SmallInt, optional.
- `notes` — Text, optional.

---

#### `user_plans`

Associates a user with a specific plan template they are currently following.

**Relationships:**
- Many-to-One with `users` (CASCADE on delete).
- Many-to-One with `plan_templates`.

**Columns:**
- `id` — UUID, primary key.
- `user_id` — UUID, references `users.id`.
- `plan_template_id` — UUID, references `plan_templates.id`.
- `start_date` — Date.
- `status` — Enum (ACTIVE, COMPLETED, ABANDONED).
- `created_at` — Timestamptz.
- `updated_at` — Timestamptz.

---

### GROUP 5: Reference Data (Foods & Exercises)

Standalone tables populated from external datasets and user contributions.
System-level foods (INGREDIENT, DISH) are shared across all users.
User-created foods are private to each user.

---

#### `foods`

Unified food catalog supporting three entry types:
- **INGREDIENT** — Raw items from USDA (e.g., Tomato, Chicken breast). Per 100g.
- **DISH** — Pre-defined meals with known nutritional values (e.g., Koshary, Molokhia). Per 100g.
- **USER_CREATED** — Custom foods created by individual users (e.g., "My protein shake"). Private to the user who created them.

**Relationships:**
- Referenced by `meal_foods`.
- Many-to-One with `users` (CASCADE on delete). Only set for USER_CREATED foods.

**Columns:**

- `id` — UUID, primary key.
- `user_id` — UUID, optional. References `users.id`. NULL for system foods, set for USER_CREATED.
- `food_type` — Enum (INGREDIENT, DISH, USER_CREATED), default INGREDIENT.
- `name` — VarChar(255). The food name used for search.
- `category` — VarChar(100). Food group.
- `calories_per_100g` — Decimal(7,2).
- `protein_per_100g` — Decimal(5,2).
- `carbs_per_100g` — Decimal(5,2).
- `fat_per_100g` — Decimal(5,2).
- `source` — VarChar(50), default 'USDA'.
- `created_at` — Timestamptz.

**Search Note:** When searching for foods, the backend must query system foods (user_id IS NULL) plus the current user's own foods (user_id = current_user). Other users' custom foods must never appear.

**Indexes:**

| Column/Expression        | Type             | Reason                                       |
|--------------------------|------------------|----------------------------------------------|
| `tsvector(name)`         | GIN              | Full-text search ("chicken" finds all types)  |
| `name` with pg_trgm      | GIN (Trigram)    | Typo-tolerant search ("chiken" finds "chicken") |
| `category`               | B-Tree           | Filter by food group                         |
| `user_id`                | B-Tree           | Filter user-created foods                    |
| `food_type`              | B-Tree           | Filter by food type                          |

---

#### `exercises`

Exercise definitions with instructions and visual aids. Populated from
the hasaneyldrm/exercises-dataset (1,324 exercises).

**Relationship:** Referenced by `workout_exercises`.

**Columns:**

- `id` — UUID, primary key.
- `name` — VarChar(255). The exercise name used for search.
- `body_part` — VarChar(100). Target body area.
- `target_muscle` — VarChar(100). Specific muscle.
- `equipment` — VarChar(100). Required equipment.
- `gif_url` — VarChar(512), optional.
- `instructions` — JSONB. Array of step-by-step instructions.
- `source` — VarChar(50), default 'EXTERNAL'.
- `created_at` — Timestamptz.

**Indexes:**

| Column/Expression        | Type             | Reason                                         |
|--------------------------|------------------|-------------------------------------------------|
| `tsvector(name)`         | GIN              | Full-text search for exercises                  |
| `name` with pg_trgm      | GIN (Trigram)    | Typo-tolerant search                            |
| `body_part`              | B-Tree           | Filter by body part                             |
| `equipment`              | B-Tree           | Filter by equipment type                        |

---

### GROUP 6: Meal Tracking

---

#### `meal_logs`

A single meal event logged by the user. Connected to the specific
food items consumed through the `meal_foods` junction table.

**Relationship:** One-to-Many with `users` (CASCADE on delete).

**Columns:**

- `id` — UUID, primary key.
- `user_id` — UUID, references `users.id`.
- `meal_type` — Enum (BREAKFAST, LUNCH, DINNER, SNACK).
- `logged_at` — Timestamptz.
- `notes` — Text, optional.

**Indexes:**

| Column                  | Type               | Reason                            |
|-------------------------|--------------------|-----------------------------------|
| `(user_id, logged_at)`  | B-Tree (Composite) | "Show me today's meals"           |
| `logged_at`             | BRIN               | Time-series optimization (Raw SQL)|

---

#### `meal_foods`

Junction table linking meals to food items. Stores snapshot values
calculated at log time so that historical records remain accurate.
Supports entries from the `foods` catalog, manual user entries, and AI vision estimations.

**Relationships:**
- Many-to-One with `meal_logs` (CASCADE on delete).
- Many-to-One with `foods` (SET NULL on delete).

**Columns:**

- `id` — UUID, primary key.
- `meal_log_id` — UUID, references `meal_logs.id`.
- `food_id` — UUID, optional. References `foods.id`. Nullable to allow for manual or AI-scanned items.
- `food_name` — VarChar(255). Used to store the name if `food_id` is null.
- `quantity_grams` — Decimal(7,2).
- `calories` — Decimal(7,2). Snapshot value.
- `protein` — Decimal(5,2). Snapshot value.
- `carbs` — Decimal(5,2). Snapshot value.
- `fat` — Decimal(5,2). Snapshot value.
- `created_at` — Timestamptz.

**Sample Data showing mixed entry types:**

| food_id | food_name         | quantity_grams | calories | Note |
|---------|-------------------|----------------|----------|------|
| abc...  | NULL              | 200.00         | 330.00   | Pulled from catalog |
| NULL    | "Grilled Chicken" | 150.00         | 245.00   | AI Vision estimate |
| NULL    | "Koshary"         | 300.00         | 480.00   | Manual entry |

---

### GROUP 7: Workout Tracking

---

#### `workout_logs`

A single workout session. Contains metadata about the entire session.

**Relationships:** 
- One-to-Many with `users` (CASCADE on delete).
- Many-to-One with `user_plans` (SET NULL on delete).

**Columns:**

- `id` — UUID, primary key.
- `user_id` — UUID, references `users.id`.
- `user_plan_id` — UUID, optional. Ties this log to an active plan template (if any).
- `logged_at` — Timestamptz.
- `duration_minutes` — Int, optional.
- `calories_burned` — Int, optional. User-reported.
- `notes` — Text, optional.

**Indexes:**

| Column                  | Type               | Reason                              |
|-------------------------|--------------------|-------------------------------------|
| `(user_id, logged_at)`  | B-Tree (Composite) | "Show me today's workouts"          |
| `logged_at`             | BRIN               | Time-series optimization (Raw SQL)  |

---

#### `workout_exercises`

An exercise performed within a workout session. Ordered by `exercise_order`.

**Relationships:**
- Many-to-One with `workout_logs` (CASCADE on delete).
- Many-to-One with `exercises`.

**Columns:**

- `id` — UUID, primary key.
- `workout_log_id` — UUID, references `workout_logs.id`.
- `exercise_id` — UUID, references `exercises.id`.
- `exercise_order` — SmallInt. Position in the workout.

---

#### `workout_sets`

A single set within an exercise. Tracks weight, repetitions, and completion status.

**Relationship:** Many-to-One with `workout_exercises` (CASCADE on delete).

**Columns:**

- `id` — UUID, primary key.
- `workout_exercise_id` — UUID, references `workout_exercises.id`.
- `set_order` — SmallInt. Position in the exercise.
- `weight_kg` — Decimal(6,2), optional.
- `reps` — Int, optional.
- `is_completed` — Boolean, default false.

---

### GROUP 8: Daily Summary

---

#### `daily_summaries`

Pre-computed daily nutrition and workout summary. Updated automatically by
database triggers whenever meals or workouts are logged.

**Design Note (Cache Paradigm):** 
This table is treated architecturally as a **cache / materialized view**. It is not the source of truth. The true values live in `meal_foods` and `workout_logs`. If the data in this table ever drifts or becomes corrupted due to failed triggers, it can be safely rebuilt from scratch by summing up the raw logs.

**Relationship:** One-to-Many with `users` (CASCADE on delete).

**Columns:**

- `id` — UUID, primary key.
- `user_id` — UUID, references `users.id`.
- `summary_date` — Date.
- `target_calories` — Int.
- `consumed_calories` — Decimal(7,2), default 0.
- `consumed_protein` — Decimal(5,2), default 0.
- `consumed_carbs` — Decimal(5,2), default 0.
- `consumed_fat` — Decimal(5,2), default 0.
- `burned_calories` — Int, default 0.
- `remaining_calories` — Decimal(7,2), default 0.
- `meal_count` — Int, default 0.
- `workout_count` — Int, default 0.
- `workout_completed` — Boolean, default false.
- `created_at` — Timestamptz.
- `updated_at` — Timestamptz.

**Indexes:**

| Column                      | Type                  | Reason                              |
|-----------------------------|-----------------------|-------------------------------------|
| `(user_id, summary_date)`   | B-Tree (Unique)       | One summary per user per day        |
| `summary_date`              | BRIN                  | Time-series optimization (Raw SQL)  |

---

### GROUP 9: AI Coach

---

#### `ai_conversations`

A conversation thread between the user and the AI coach.

**Relationship:** One-to-Many with `users` (CASCADE on delete).

**Columns:**

- `id` — UUID, primary key.
- `user_id` — UUID, references `users.id`.
- `title` — VarChar(255), optional.
- `created_at` — Timestamptz.
- `updated_at` — Timestamptz.

---

#### `ai_messages`

Individual messages within a conversation.

**Relationship:** Many-to-One with `ai_conversations` (CASCADE on delete).

**Columns:**

- `id` — UUID, primary key.
- `conversation_id` — UUID, references `ai_conversations.id`.
- `role` — Enum (USER, ASSISTANT).
- `content` — Text. The message body.
- `context` — JSONB, optional. User data snapshot sent to the AI.
- `sent_at` — Timestamptz.

---

### GROUP 10: Audit Log

---

#### `audit_logs`

Immutable record of every significant data change. Populated automatically
by triggers on critical tables. Useful for debugging, security reviews,
and understanding data history.

**Columns:**

- `id` — UUID, primary key.
- `user_id` — UUID, optional. The user who caused the change.
- `table_name` — VarChar(100). Which table was modified.
- `record_id` — UUID. The primary key of the modified row.
- `action` — Enum (INSERT, UPDATE, DELETE).
- `old_values` — JSONB, optional. Previous state (for UPDATE and DELETE).
- `new_values` — JSONB, optional. New state (for INSERT and UPDATE).
- `performed_at` — Timestamptz.

---

## Indexing Strategy

This database uses four types of indexes, each chosen for a specific use case:

### B-Tree (Default)
Used for equality checks, range queries, and sorting. Applied to foreign keys, status columns, and composite lookups.

### BRIN (Block Range Index)
Extremely small indexes designed for columns where data is naturally ordered by insertion time. A BRIN index can be 100x smaller than an equivalent B-Tree while providing comparable performance for time-range queries.
**Applied to:** `meal_logs.logged_at`, `workout_logs.logged_at`, `daily_summaries.summary_date`.

### GIN (Generalized Inverted Index)
Used for full-text search via `tsvector`. Enables natural language queries on food and exercise names.
**Applied to:** `foods.name`, `exercises.name`.

### GIN with pg_trgm (Trigram)
An extension of GIN that enables fuzzy matching and typo tolerance. If a user types "chiken" instead of "chicken", the database still finds the correct result.
**Applied to:** `foods.name`, `exercises.name`.

### Partial Unique Index
A conditional unique constraint that only applies to rows matching a filter. Used to enforce the business rule that each user can have at most one active goal.
**Applied to:** `goals (user_id) WHERE status = 'ACTIVE'`.

---

## Database-Level Logic

These are SQL objects that live inside the database and execute automatically.
They are maintained as raw SQL migration files in the `sql/` directory.

### Triggers

| Trigger                     | Fires On                  | Action                                              |
|-----------------------------|---------------------------|-----------------------------------------------------|
| `trg_daily_summary_meal`    | INSERT/DELETE on `meal_foods` | Recalculates consumed calories and macros for the day |
| `trg_daily_summary_workout` | INSERT/DELETE on `workout_logs` | Updates burned calories and workout count for the day |
| `trg_audit_log`             | INSERT/UPDATE/DELETE on critical tables | Records the change in `audit_logs`        |

### Full-Text Search Setup

The `tsvector` columns and their associated triggers are created via raw SQL to keep food and exercise search indexes updated automatically when new data is inserted.

---

## Data Sources and Seeding

### Food Data

| Source                  | Dataset          | Records | Format | License     |
|-------------------------|------------------|---------|--------|-------------|
| USDA FoodData Central   | Foundation Foods | ~400    | CSV    | Public Domain |

Download: https://fdc.nal.usda.gov/download-datasets.html

The raw USDA data is multi-file and relational. A processing script reads the CSV files, extracts the relevant columns, and inserts them into the `foods` table.

### Exercise Data

| Source                       | Records | Format | License    |
|------------------------------|---------|--------|------------|
| hasaneyldrm/exercises-dataset | 1,324   | JSON   | Open Source |

Download: https://github.com/hasaneyldrm/exercises-dataset

The dataset provides a single JSON file with exercise names, body parts, target muscles, equipment, GIF URLs, and instructions. A processing script parses the JSON and inserts the data into the `exercises` table.

---

## Project Structure

```
spotter-db/
├── README.md                   <- This file
├── docs/
│   ├── erd.svg                 <- Entity Relationship Diagram
│   └── spotter-mascot.png      <- Project mascot
├── schema/
│   └── schema.prisma           <- Prisma schema definition
├── sql/
│   ├── indexes.sql             <- GIN, BRIN, Partial Unique indexes
│   ├── triggers.sql            <- Daily summary and audit log triggers
│   ├── full_text_search.sql    <- tsvector and pg_trgm setup
│   └── seed.sql                <- Reference data insertion
└── data/
    ├── usda_foundation/        <- Raw USDA CSV files
    └── exercises/              <- Raw exercise JSON data
```
