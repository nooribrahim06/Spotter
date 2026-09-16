import * as z from "zod";

// Context is always loaded for the authenticated user; no query filters.
export const planContextQuerySchema = z.object({}).strict();

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
