-- AlterTable
ALTER TABLE "goals" ADD COLUMN     "cancelled_at" TIMESTAMPTZ(6),
ADD COLUMN     "completed_at" TIMESTAMPTZ(6),
ADD COLUMN     "started_at" TIMESTAMPTZ(6);
