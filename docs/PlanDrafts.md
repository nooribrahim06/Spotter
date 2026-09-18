# Plan draft persistence

`POST /api/plans/generate` returns `201 Created` with `{ data: plan }` after saving
an entire `DRAFT`: the plan, its seven days, and planned workouts. The existing
active plan stays unchanged. Activation and draft retrieval are future work.

## Responsibilities

- **Tools and generation rules:** validate searches, catalog selections, plan shape,
  and domain constraints once, before persistence.
- **plan.service.js:** combine the validated proposal with backend-owned identity,
  goal, targets, timezone, schedule dates, meal-option IDs, and workout ordering.
  Translate a changed-user-context outcome into `409 PLAN_CONTEXT_CHANGED`.
- **plan.repository.js:** lock and reload the user's generation context, compare it
  with the original context, and save the draft in the same short transaction.
  Database failures roll back through the existing `DATABASE_ERROR` contract.

The persistence step receives `{ userId, expectedContext, draftData }`.
It does not receive search results, rebuild catalog maps, revalidate the proposal,
query catalog/template records, or explicitly lock them. Normal foreign-key
constraints still apply when inserting the plan.

## User-context consistency

The repository uses `SELECT ... FOR UPDATE` on the user, body profile, existing
goals/progress entries, and health/nutrition/training profiles. After acquiring
those locks, it reloads the same source fields used during generation. Changes to
relevant values reject the save; unrelated `updatedAt` changes do not.

Existing goal/progress rows are locked because editing an older row can change
which one is active/latest. Parent user/body-profile locks also block foreign-key
checks for new child records, preventing new goals or progress entries from
slipping between comparison and saving. This relies on the enforced foreign keys.

Groq calls happen before the transaction. Locks are released on commit or rollback.
Catalog changes during generation are an accepted draft-stage tradeoff; future
activation must check current catalog access and plan suitability. Repeated
successful requests can create separate drafts; request idempotency is not implemented.

## Frontend behavior

Disable generation and relevant profile/goal editing controls while the request
is pending, and restore them on success or failure. Other tabs/devices can still
edit during generation, so the backend remains authoritative.

On `201`, display the saved draft for review. On `409 PLAN_CONTEXT_CHANGED`, explain
that planning preferences changed and offer regeneration. There is no catalog-change
conflict response during draft saving.

## Verification

From `backend/`, run `npm test` for the regular suite and `npm run test:plans-db`
against a test database for persistence, user-context conflicts, concurrent locks,
rollback, and the absence of catalog rechecks. The integration suite creates unique
fixtures and cleans up only its own rows; it makes no AI calls.
