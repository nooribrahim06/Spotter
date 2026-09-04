import * as z from "zod";

export const createWorkoutSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    notes: z.string().trim().min(1).max(1000).optional(),
    startedAt: z.iso
      .datetime({ offset: true })
      .transform((value) => new Date(value))
      .optional(),
  })
  .strict();

export const workoutIdParamSchema = z
  .object({
    workoutId: z.string().uuid("Workout ID must be a valid UUID."),
  })
  .strict();

const optionalDateTime = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value))
  .optional();

export const workoutHistoryQuerySchema = z
  .object({
    from: optionalDateTime,
    to: optionalDateTime,
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict()
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    path: ["to"],
    message: "to must be after or equal to from.",
  });
