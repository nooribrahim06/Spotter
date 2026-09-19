# Plan draft persistence

`POST /api/plans/generate` returns `201 Created` with `{ data: plan }` after saving
an entire `DRAFT`: the plan, its seven days, and planned workouts. The existing
active plan stays unchanged. Draft activation is available through the endpoint below.

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
Catalog changes during generation are an accepted draft-stage tradeoff; activation
checks only current catalog existence and accessibility. Repeated
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

## Read endpoints

All reads require authentication and return `Cache-Control: no-store`.

| Endpoint | Response |
| --- | --- |
| `GET /api/plans` | `{ data: { items, pagination } }`; owned summaries, newest first, without nested days/workouts. |
| `GET /api/plans/active` | `{ data: plan }` or `{ data: null }` when none has stored `ACTIVE` status. |
| `GET /api/plans/:planId` | `{ data: plan }` with days ordered Monday–Sunday and workouts by `orderIndex`. Missing/unowned plans return `404 PLAN_NOT_FOUND`. |

The list accepts optional `status` and `goalId` filters, `page` (default 1),
and `limit` (default 20, maximum 50). Pagination includes `page`, `limit`,
`totalItems`, `totalPages`, and `hasNextPage`. Invalid parameters and unknown
query fields return 400. These endpoints only read data; they do not activate,
expire, or otherwise update plans.

## Activate a reviewed draft

`POST /api/plans/:planId/activate` accepts:

```json
{ "expectedActivePlanId": null }
```

Send the active plan ID shown during review instead of null when replacing a plan.
Success returns `200`, `Cache-Control: no-store`, and `{ data: plan }` with `ACTIVE`
status and `activatedAt`. The previous active plan becomes `SUPERSEDED` with
`endedAt` in the same transaction. No actual meals or workouts are created.

The service loads the plan and checks readiness, goal/timezone/nutrition style,
calculated user targets, edits to profiles/goal since draft creation, and catalog
item availability. It then calls the repository to switch statuses. No validation callbacks
are passed to the repository. One user-row lock serializes competing activations;
activation does not lock the entire profile context or the user's plan history.
Any such profile edit requires regeneration, even if the change might be harmless;
the current schema does not store a full historical profile snapshot.

The start date must be today in the plan's timezone, and the end date must be today
or later. The saved draft already passed its content and domain validation during
generation. Activation checks only that every selected exercise, food, and recipe
still exists and is active. Foods and recipes must be shared or owned by the user;
linked recipe ingredients must also be active and accessible.

The repository counts unique accessible IDs and returns a boolean. It does not load
nutrients, reconstruct tool results, or rerun nutrition/training validation. Catalog
nutrient or exercise-property changes are an accepted tradeoff and do not themselves
block activation. User-context checks above remain separate. Activation makes no AI
calls and does not change reviewed content or targets.

Suitability checks happen before the status-switch transaction. A profile or catalog
edit in that interval is an accepted concurrency tradeoff. The transaction guarantees
the atomic status switch and competing-activation handling, not an unchanged profile
snapshot through commit. Future plan-edit/end operations must coordinate their status
writes with the same user-row lock.

Relevant errors:

| Code | Status | Meaning |
| --- | --- | --- |
| `PLAN_NOT_FOUND` | 404 | Missing or unowned plan. |
| `PLAN_NOT_DRAFT` | 409 | Ended/superseded plans cannot be activated again. |
| `PLAN_ACTIVE_CHANGED` | 409 | Another request changed the active plan; refresh the review. |
| `PLAN_DATES_INVALID` | 409 | Draft does not start today or has expired/invalid coverage. |
| `PLAN_CONTEXT_CHANGED` | 409 | Planning context or targets changed; regenerate. |
| `PLAN_CONTEXT_INCOMPLETE` / `PLAN_NOT_ELIGIBLE` | 422 | Existing readiness rules prevent activation. |
| `PLAN_CONTENT_INVALID` | 422 | A selected item or linked recipe ingredient is missing, inactive, or inaccessible. |

Retrying the same already-active plan returns it without resetting activation time.
Two different drafts targeting the same previous active plan cannot both replace it:
one succeeds and the other returns `PLAN_ACTIVE_CHANGED`. Database failures roll
back both status updates. End/discard actions and automatic expiry remain separate
future lifecycle work.
