import * as z from "zod";

// Starting a workout requires no client data because the database supplies the
// ID, owner, status, and default start time. These optional fields let the user
// personalize the session without controlling its lifecycle.
export const createWorkoutSchema = z
  .object({
    // A name is optional because the UI can derive one from startedAt, such as
    // "Morning workout". When supplied, blank names are rejected after trimming.
    name: z.string().trim().min(1).max(160).optional(),
    notes: z.string().trim().min(1).max(1000).optional(),

    // API dates arrive as ISO strings. Requiring an offset avoids interpreting
    // an ambiguous local time; transform gives the service a Date object.
    startedAt: z.iso
      .datetime({ offset: true })
      .transform((value) => new Date(value))
      .optional(),
  })
  // Reject server-controlled and misspelled fields instead of silently dropping
  // them, including userId, status, completedAt, and durationMinutes.
  .strict();

// Only user-authored labels may be patched. null deliberately clears a value
// so the UI can return to its generated workout name or remove notes.
export const updateWorkoutSchema = z
  .object({
    name: z.string().trim().min(1).max(160).nullable().optional(),
    notes: z.string().trim().min(1).max(1000).nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update.",
  });

// Completion and cancellation are server-controlled actions. An absent body is
// accepted as {}, while any submitted field is rejected.
export const workoutActionSchema = z.object({}).strict().default({});

// Route parameters are untrusted strings. Validate the ID before a database
// query so malformed values never reach Prisma.
export const workoutIdParamSchema = z
  .object({
    workoutId: z.string().uuid("Workout ID must be a valid UUID."),
  })
  .strict();

// Both history boundaries use the same optional parsing behavior.
const optionalDateTime = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value))
  .optional();

export const workoutHistoryQuerySchema = z
  .object({
    from: optionalDateTime,
    to: optionalDateTime,

    // Query values arrive as strings. coerce converts values such as "2" to 2
    // before applying the integer and pagination constraints.
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict()
  // refine fits because this is one cross-field yes/no rule. superRefine would
  // be useful if this check needed to report several independent issues.
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    // Attach the issue to "to" so the frontend can highlight that input.
    path: ["to"],
    message: "to must be after or equal to from.",
  });

export const startWorkoutFromPlanSchema = z
  .object({
    planWorkoutId: z.string().uuid("Plan workout ID must be a valid UUID."),
    scheduledDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Scheduled date must use YYYY-MM-DD format"),
  })
  .strict();
