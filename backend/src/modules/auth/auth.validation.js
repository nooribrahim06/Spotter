import * as z from "zod";
export const signupSchema = z.object({
  email: z.string().email(),
  username: z.string().trim().min(3).max(30),
  password: z.string().min(8).max(72),
});

export const verifySchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/i), // 64-char hex string
});

export const resendVerificationSchema = z.object({
  email: z.string().email(),
});
// to simplify we can make it only for email now , username can be added later if needed
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
});
