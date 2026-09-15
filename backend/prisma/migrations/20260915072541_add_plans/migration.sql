/*
  Warnings:

  - A unique constraint covering the columns `[source_plan_workout_id,scheduled_date]` on the table `workouts` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED', 'ENDED');

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "WorkoutSlot" AS ENUM ('MORNING', 'AFTERNOON', 'EVENING', 'ANYTIME');

-- AlterTable
ALTER TABLE "meals" ADD COLUMN     "scheduled_date" DATE,
ADD COLUMN     "source_meal_option_id" UUID,
ADD COLUMN     "source_plan_day_id" UUID;

-- AlterTable
ALTER TABLE "workouts" ADD COLUMN     "scheduled_date" DATE,
ADD COLUMN     "source_plan_workout_id" UUID;

-- CreateTable
CREATE TABLE "plan_templates" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "goal_type" "GoalType" NOT NULL,
    "experience_level" "TrainingExperienceLevel" NOT NULL,
    "duration_weeks" SMALLINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "plan_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_template_days" (
    "id" UUID NOT NULL,
    "plan_template_id" UUID NOT NULL,
    "day_number" SMALLINT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "workout_blueprint" JSONB,
    "nutrition_blueprint" JSONB,
    "notes" TEXT,

    CONSTRAINT "plan_template_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "goal_id" UUID NOT NULL,
    "source_template_id" UUID,
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "nutrition_plan_style" "NutritionPlanStyle" NOT NULL,
    "title" VARCHAR(160),
    "explanation" TEXT,
    "calorie_target" INTEGER,
    "protein_target_grams" INTEGER,
    "carbohydrate_target_grams" INTEGER,
    "fat_target_grams" INTEGER,
    "start_date" DATE,
    "end_date" DATE,
    "timezone" VARCHAR(64) NOT NULL,
    "activated_at" TIMESTAMPTZ(6),
    "ended_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_days" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "day_of_week" "DayOfWeek" NOT NULL,
    "breakfast_options" JSONB,
    "lunch_options" JSONB,
    "dinner_options" JSONB,
    "snack_options" JSONB,
    "nutrition_guidance" TEXT,
    "notes" TEXT,

    CONSTRAINT "plan_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_workouts" (
    "id" UUID NOT NULL,
    "plan_day_id" UUID NOT NULL,
    "slot" "WorkoutSlot" NOT NULL DEFAULT 'ANYTIME',
    "order_index" SMALLINT NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "estimated_duration_minutes" SMALLINT,
    "exercises" JSONB NOT NULL,
    "notes" TEXT,

    CONSTRAINT "plan_workouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plan_templates_goal_type_experience_level_idx" ON "plan_templates"("goal_type", "experience_level");

-- CreateIndex
CREATE INDEX "plan_template_days_plan_template_id_idx" ON "plan_template_days"("plan_template_id");

-- CreateIndex
CREATE UNIQUE INDEX "plan_template_days_plan_template_id_day_number_key" ON "plan_template_days"("plan_template_id", "day_number");

-- CreateIndex
CREATE INDEX "plans_user_id_idx" ON "plans"("user_id");

-- CreateIndex
CREATE INDEX "plans_goal_id_idx" ON "plans"("goal_id");

-- CreateIndex
CREATE INDEX "plans_source_template_id_idx" ON "plans"("source_template_id");

-- CreateIndex
CREATE INDEX "plans_user_id_status_idx" ON "plans"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "one_active_plan_per_user" ON "plans"("user_id") WHERE (status = 'ACTIVE');

-- CreateIndex
CREATE INDEX "plan_days_plan_id_idx" ON "plan_days"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "plan_days_plan_id_day_of_week_key" ON "plan_days"("plan_id", "day_of_week");

-- CreateIndex
CREATE INDEX "plan_workouts_plan_day_id_idx" ON "plan_workouts"("plan_day_id");

-- CreateIndex
CREATE UNIQUE INDEX "plan_workouts_plan_day_id_order_index_key" ON "plan_workouts"("plan_day_id", "order_index");

-- CreateIndex
CREATE INDEX "meals_source_plan_day_id_idx" ON "meals"("source_plan_day_id");

-- CreateIndex
CREATE INDEX "meals_scheduled_date_idx" ON "meals"("scheduled_date");

-- CreateIndex
CREATE INDEX "workouts_source_plan_workout_id_idx" ON "workouts"("source_plan_workout_id");

-- CreateIndex
CREATE INDEX "workouts_scheduled_date_idx" ON "workouts"("scheduled_date");

-- CreateIndex
CREATE UNIQUE INDEX "one_active_workout_per_scheduled_occurrence" ON "workouts"("source_plan_workout_id", "scheduled_date") WHERE (status IN ('IN_PROGRESS', 'COMPLETED'));

-- AddForeignKey
ALTER TABLE "meals" ADD CONSTRAINT "meals_source_plan_day_id_fkey" FOREIGN KEY ("source_plan_day_id") REFERENCES "plan_days"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_source_plan_workout_id_fkey" FOREIGN KEY ("source_plan_workout_id") REFERENCES "plan_workouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_template_days" ADD CONSTRAINT "plan_template_days_plan_template_id_fkey" FOREIGN KEY ("plan_template_id") REFERENCES "plan_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_source_template_id_fkey" FOREIGN KEY ("source_template_id") REFERENCES "plan_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_days" ADD CONSTRAINT "plan_days_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_workouts" ADD CONSTRAINT "plan_workouts_plan_day_id_fkey" FOREIGN KEY ("plan_day_id") REFERENCES "plan_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;
