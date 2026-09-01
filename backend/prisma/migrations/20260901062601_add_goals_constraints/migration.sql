-- AlterTable
ALTER TABLE "goals" ADD COLUMN     "cancelled_at" TIMESTAMPTZ(6),
ADD COLUMN     "completed_at" TIMESTAMPTZ(6),
ADD COLUMN     "started_at" TIMESTAMPTZ(6);
-- manual addition 
CREATE UNIQUE INDEX one_active_goal_per_user
ON goals (user_id)
WHERE status = 'ACTIVE';