import "dotenv/config";
import * as z from "zod";

const jwtSecret = z
  .string()
  .min(1, "Secret is required")
  .regex(/^[A-Za-z0-9_-]+$/, "Secret must be base64url")
  .refine(
    (value) => Buffer.from(value, "base64url").length >= 32,
    "Secret must contain at least 32 bytes"
  );

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]),

    PORT: z.coerce.number().int().min(1).max(65535).default(5050),
    HOST: z.string().min(1).default("localhost"),

    DATABASE_URL: z
      .string()
      .regex(/^postgres(?:ql)?:\/\//, "Invalid PostgreSQL URL"),

    FRONTEND_URL: z.string().url(),

    ACCESS_TOKEN_SECRET: jwtSecret,

    

    EMAIL_USER: z.string().email(),
    EMAIL_APP_PASSWORD: z.string().min(1),
  })
  .superRefine((env, context) => {
    if (
      env.NODE_ENV === "production" &&
      !env.FRONTEND_URL.startsWith("https://")
    ) {
      context.addIssue({
        code: "custom",
        path: ["FRONTEND_URL"],
        message: "Production frontend URL must use HTTPS",
      });
    }
  });

export function validateEnvironment() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error(
      "Invalid environment configuration:",
      result.error.flatten().fieldErrors
    );

    throw new Error("Environment validation failed");
  }

  return result.data;
}

export const env = validateEnvironment();
