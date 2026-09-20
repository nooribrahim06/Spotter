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

const durationInDays = (defaultValue) =>
  z
    .string()
    .trim()
    .regex(/^\d+d$/, "Duration must use days, for example 7d")
    .default(defaultValue)
    .transform((value) => Number(value.slice(0, -1)));

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
    ACCESS_TOKEN_EXPIRATION: z
      .string()
      .trim()
      .regex(/^\d+(?:ms|s|m|h|d)$/, "Invalid access token expiration")
      .default("15m"),
    REFRESH_TOKEN_EXPIRATION: durationInDays("7d"),
    SESSION_EXPIRATION: durationInDays("30d"),

    EMAIL_USER: z.string().email(),
    EMAIL_APP_PASSWORD: z.string().min(1),

    // Cloudinary credentials used by the backend for signed uploads.
    CLOUD_NAME: z.string().trim().min(1),
    CLOUD_API_KEY: z.string().trim().min(1),
    CLOUD_API_SECRET: z.string().trim().min(1),
    GROQ_API_KEY: z.string().trim().min(1),
    GROQ_API_KEY2: z.string().trim().min(1),

    GROQ_TOOL_MODEL: z.string().trim().min(1),
    GROQ_GENERATION_MODEL: z.string().trim().min(1),
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
