import * as z from "zod";
export const signupSchema = z.object({
  email: z.string().email(),
  username: z.string().trim().min(3).max(30),
  password: z.string().min(8).max(72),
});

export const verifySchema = z.object({
  token: z.string().length(64), // 64-char hex string
});
// to simplify we can make it only for email now , username can be added later if needed
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
});
