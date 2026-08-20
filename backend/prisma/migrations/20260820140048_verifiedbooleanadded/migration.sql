-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verify_token" VARCHAR(64),
ADD COLUMN     "verify_token_expires_at" TIMESTAMPTZ(6);
