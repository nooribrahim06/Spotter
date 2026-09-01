import * as z from "zod";

const goalTypeEnum = z.enum(  "LOSE_WEIGHT",
  "MAINTAIN_WEIGHT",
  "GAIN_WEIGHT",
  "BUILD_MUSCLE",
  "IMPROVE_FITNESS",
);
// create goal schema for post /api/goals

// it must have this data
// 1. userId 
// 2. goaltype and it is from the num  
// 3. targetWeight and it must be a realistic number
// 4. target date and it must be a date in the future

export const createGoalSchema = z.object({
  userId: z.string().uuid().required(),
  goalType: goalTypeEnum.required(),
  targetWeightKg: z.number().positive().min(30, "Target weight must be at least 30kg").max(300, "Target weight must be less than 300kg").optional(),
  targetDate: z.date().min(new Date(), "Target date must be in the future").optional()
}).strict();