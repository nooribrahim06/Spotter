import * as z from "zod";

// Context is always loaded for the authenticated user; no query filters.
export const planContextQuerySchema = z.object({}).strict();

export const planListQuerySchema = z.object({
  status: z.enum(["DRAFT", "ACTIVE", "SUPERSEDED", "ENDED"]).optional(),
  goalId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();

export const planIdParamSchema = z.object({
  planId: z.string().uuid("Plan ID must be a valid UUID."),
}).strict();

const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);

    return (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Invalid calendar date");

export const generatePlanSchema = z
  .object({
    startDate: localDateSchema,
    endDate: localDateSchema,
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.endDate < data.startDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "endDate must be on or after startDate.",
      });
    }
  });
