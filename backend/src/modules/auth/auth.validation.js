import * as z from "zod";
export const signupSchema = z.object({
  email: z.string().email(),
  username: z.string().trim().min(3).max(30),
  password: z.string().min(8).max(72),
});