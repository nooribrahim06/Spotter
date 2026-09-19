/*
  Warnings:

  - A unique constraint covering the columns `[source_plan_workout_id,scheduled_date]` on the table `workouts` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "PlanStatus" ADD VALUE 'DISCARDED';

-- DropIndex
DROP INDEX "idx_audit_logs_performed_at_brin";

-- DropIndex
DROP INDEX "idx_daily_summaries_summary_date_brin";

-- DropIndex
DROP INDEX "idx_exercises_instructions_gin";

-- DropIndex
DROP INDEX "idx_exercises_name_trgm";

-- DropIndex
DROP INDEX "idx_foods_aliases_gin";

-- DropIndex
DROP INDEX "idx_foods_name_ar_trgm";

-- DropIndex
DROP INDEX "idx_foods_name_en_trgm";

-- DropIndex
DROP INDEX "idx_meals_occurred_at_brin";

-- DropIndex
DROP INDEX "idx_progress_entries_recorded_at_brin";

-- DropIndex
DROP INDEX "idx_recipes_aliases_gin";

-- DropIndex
DROP INDEX "idx_recipes_name_ar_trgm";

-- DropIndex
DROP INDEX "idx_recipes_name_en_trgm";

-- DropIndex
DROP INDEX "idx_workouts_started_at_brin";

-- DropIndex
DROP INDEX "one_active_workout_per_scheduled_occurrence";

-- CreateIndex
CREATE UNIQUE INDEX "one_active_workout_per_scheduled_occurrence" ON "workouts"("source_plan_workout_id", "scheduled_date") WHERE (status IN ('IN_PROGRESS', 'COMPLETED'));
