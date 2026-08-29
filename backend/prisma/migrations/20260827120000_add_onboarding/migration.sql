-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "SexForCalculation" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "UnitSystem" AS ENUM ('METRIC', 'IMPERIAL');

-- CreateEnum
CREATE TYPE "ActivityLevel" AS ENUM ('SEDENTARY', 'LIGHTLY_ACTIVE', 'MODERATELY_ACTIVE', 'VERY_ACTIVE');

-- CreateEnum
CREATE TYPE "GoalType" AS ENUM ('LOSE_WEIGHT', 'MAINTAIN_WEIGHT', 'GAIN_WEIGHT', 'BUILD_MUSCLE', 'IMPROVE_FITNESS');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "fitness_onboarding_completed_at" TIMESTAMPTZ(6),
ADD COLUMN "onboarding_status" "OnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN "onboarding_step" INTEGER DEFAULT 1;

-- CreateTable
CREATE TABLE "user_profiles" (
    "user_id" UUID NOT NULL,
    "birth_year" SMALLINT NOT NULL,
    "birth_month" SMALLINT NOT NULL,
    "birth_day" SMALLINT NOT NULL,
    "adult_confirmed_at" TIMESTAMPTZ(6) NOT NULL,
    "sex_for_calculation" "SexForCalculation" NOT NULL,
    "preferred_unit_system" "UnitSystem" NOT NULL,
    "height_cm" DECIMAL(5,2) NOT NULL,
    "starting_weight_kg" DECIMAL(6,2) NOT NULL,
    "activity_level" "ActivityLevel",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "goal_type" "GoalType" NOT NULL,
    "target_weight_kg" DECIMAL(6,2),
    "target_date" DATE,
    "status" "GoalStatus" NOT NULL DEFAULT 'DRAFT',
    "is_onboarding_goal" BOOLEAN,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress_entries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "goal_id" UUID,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "weight_kg" DECIMAL(6,2) NOT NULL,
    "notes" VARCHAR(1000),
    "is_initial_for_goal" BOOLEAN,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "progress_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "goals_user_id_idx" ON "goals"("user_id");

-- CreateIndex
CREATE INDEX "goals_user_id_status_idx" ON "goals"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "goals_user_id_is_onboarding_goal_key" ON "goals"("user_id", "is_onboarding_goal");

-- CreateIndex
CREATE INDEX "progress_entries_user_id_recorded_at_idx" ON "progress_entries"("user_id", "recorded_at");

-- CreateIndex
CREATE INDEX "progress_entries_goal_id_idx" ON "progress_entries"("goal_id");

-- CreateIndex
CREATE UNIQUE INDEX "progress_entries_goal_id_is_initial_for_goal_key" ON "progress_entries"("goal_id", "is_initial_for_goal");

-- CreateIndex
CREATE UNIQUE INDEX "users_verify_token_key" ON "users"("verify_token");

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_entries" ADD CONSTRAINT "progress_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_entries" ADD CONSTRAINT "progress_entries_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
