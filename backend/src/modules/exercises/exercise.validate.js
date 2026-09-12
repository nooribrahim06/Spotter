import * as z from "zod";

import { EXERCISE_OPTIONS } from "../../config/exercise.js";

export const listExercisesQuerySchema = z
  .object({
    search: z.string().trim().min(1).max(100).optional(),
    exerciseType: z.enum(EXERCISE_OPTIONS.exerciseTypes).optional(),
    bodyPart: z.enum(EXERCISE_OPTIONS.bodyParts).optional(),
    difficulty: z.enum(EXERCISE_OPTIONS.difficulties).optional(),
    force: z.enum(EXERCISE_OPTIONS.forces).optional(),
    mechanic: z.enum(EXERCISE_OPTIONS.mechanics).optional(),
    equipment: z.enum(EXERCISE_OPTIONS.equipment).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export const exerciseIdParamSchema = z
  .object({
    exerciseId: z.string().uuid("Exercise ID must be a valid UUID."),
  })
  .strict();
