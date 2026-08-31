/*
  Warnings:

  - You are about to drop the column `user_id` on the `progress_entries` table. All the data in the column will be lost.
  - You are about to alter the column `display_name` on the `user_profiles` table. The data in that column could be lost. The data in that column will be cast from `VarChar(100)` to `VarChar(50)`.
  - You are about to alter the column `first_name` on the `user_profiles` table. The data in that column could be lost. The data in that column will be cast from `VarChar(100)` to `VarChar(40)`.
  - You are about to alter the column `last_name` on the `user_profiles` table. The data in that column could be lost. The data in that column will be cast from `VarChar(100)` to `VarChar(40)`.
  - Added the required column `body_profile_id` to the `progress_entries` table without a default value. This is not possible if the table is not empty.
  - Made the column `first_name` on table `user_profiles` required. This step will fail if there are existing NULL values in that column.
  - Made the column `last_name` on table `user_profiles` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "NutritionPlanStyle" AS ENUM ('EXACT_MEALS', 'FLEXIBLE_MEALS', 'MACRO_BASED', 'SIMPLE_GUIDANCE');

-- CreateEnum
CREATE TYPE "CookingSkill" AS ENUM ('NONE', 'BASIC', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "KitchenAccess" AS ENUM ('NONE', 'MICROWAVE_ONLY', 'BASIC', 'FULL');

-- CreateEnum
CREATE TYPE "FoodBudgetLevel" AS ENUM ('LOW', 'MODERATE', 'FLEXIBLE');

-- CreateEnum
CREATE TYPE "TrainingExperienceLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "TrainingEnvironment" AS ENUM ('COMMERCIAL_GYM', 'HOME_GYM', 'HOME_MINIMAL', 'OUTDOORS', 'MIXED');

-- CreateEnum
CREATE TYPE "CoachingStyle" AS ENUM ('SUPPORTIVE', 'BALANCED', 'DIRECT');

-- CreateEnum
CREATE TYPE "ExplanationLevel" AS ENUM ('CONCISE', 'NORMAL', 'DETAILED');

-- CreateEnum
CREATE TYPE "MotivationStyle" AS ENUM ('ENCOURAGING', 'ACCOUNTABILITY', 'FACT_BASED', 'MINIMAL');

-- CreateEnum
CREATE TYPE "CheckinFrequency" AS ENUM ('DAILY', 'FEW_TIMES_PER_WEEK', 'WEEKLY');

-- CreateEnum
CREATE TYPE "BodyMeasurementType" AS ENUM ('WAIST', 'ABDOMEN', 'CHEST', 'HIPS', 'NECK', 'SHOULDERS', 'LEFT_UPPER_ARM', 'RIGHT_UPPER_ARM', 'LEFT_FOREARM', 'RIGHT_FOREARM', 'LEFT_THIGH', 'RIGHT_THIGH', 'LEFT_CALF', 'RIGHT_CALF');

-- DropForeignKey
ALTER TABLE "progress_entries" DROP CONSTRAINT "progress_entries_user_id_fkey";

-- DropIndex
DROP INDEX "progress_entries_user_id_recorded_at_idx";

-- AlterTable
ALTER TABLE "progress_entries" DROP COLUMN "user_id",
ADD COLUMN     "body_fat_percentage" DECIMAL(5,2),
ADD COLUMN     "body_profile_id" UUID NOT NULL,
ADD COLUMN     "resting_heart_rate_bpm" SMALLINT,
ADD COLUMN     "skeletal_muscle_mass_kg" DECIMAL(6,2);

-- AlterTable
ALTER TABLE "user_profiles" ALTER COLUMN "display_name" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "first_name" SET NOT NULL,
ALTER COLUMN "first_name" SET DATA TYPE VARCHAR(40),
ALTER COLUMN "last_name" SET NOT NULL,
ALTER COLUMN "last_name" SET DATA TYPE VARCHAR(40);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "timezone" VARCHAR(64);

-- CreateTable
CREATE TABLE "progress_measurements" (
    "id" UUID NOT NULL,
    "progress_entry_id" UUID NOT NULL,
    "measurement_type" "BodyMeasurementType" NOT NULL,
    "value_cm" DECIMAL(6,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "progress_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition_profiles" (
    "body_profile_id" UUID NOT NULL,
    "dietary_preference_codes" JSONB,
    "food_allergies" JSONB,
    "food_intolerances" JSONB,
    "food_preferences" JSONB,
    "meals_per_day" SMALLINT,
    "snacks_per_day" SMALLINT,
    "plan_style" "NutritionPlanStyle",
    "cooking_skill" "CookingSkill",
    "max_meal_prep_minutes" SMALLINT,
    "kitchen_access" "KitchenAccess",
    "food_budget_level" "FoodBudgetLevel",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "nutrition_profiles_pkey" PRIMARY KEY ("body_profile_id")
);

-- CreateTable
CREATE TABLE "training_profiles" (
    "body_profile_id" UUID NOT NULL,
    "overall_experience_level" "TrainingExperienceLevel",
    "resistance_training_level" "TrainingExperienceLevel",
    "cardio_training_level" "TrainingExperienceLevel",
    "currently_training_consistently" BOOLEAN,
    "training_days_per_week" SMALLINT,
    "available_days" JSONB,
    "preferred_session_minutes" SMALLINT,
    "training_environment" "TrainingEnvironment",
    "available_equipment" JSONB,
    "preferred_training_styles" JSONB,
    "preferred_cardio_type" VARCHAR(100),
    "average_sleep_minutes" SMALLINT,
    "sleep_quality" SMALLINT,
    "typical_stress_level" SMALLINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "training_profiles_pkey" PRIMARY KEY ("body_profile_id")
);

-- CreateTable
CREATE TABLE "coaching_preferences" (
    "user_id" UUID NOT NULL,
    "coaching_style" "CoachingStyle" NOT NULL DEFAULT 'BALANCED',
    "explanation_level" "ExplanationLevel" NOT NULL DEFAULT 'NORMAL',
    "motivation_style" "MotivationStyle",
    "checkin_frequency" "CheckinFrequency",
    "proactive_coaching" BOOLEAN NOT NULL DEFAULT false,
    "workout_reminders" BOOLEAN NOT NULL DEFAULT false,
    "nutrition_reminders" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "coaching_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "progress_measurements_progress_entry_id_idx" ON "progress_measurements"("progress_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "progress_measurements_progress_entry_id_measurement_type_key" ON "progress_measurements"("progress_entry_id", "measurement_type");

-- CreateIndex
CREATE INDEX "progress_entries_body_profile_id_recorded_at_idx" ON "progress_entries"("body_profile_id", "recorded_at");

-- AddForeignKey
ALTER TABLE "progress_entries" ADD CONSTRAINT "progress_entries_body_profile_id_fkey" FOREIGN KEY ("body_profile_id") REFERENCES "body_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_measurements" ADD CONSTRAINT "progress_measurements_progress_entry_id_fkey" FOREIGN KEY ("progress_entry_id") REFERENCES "progress_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nutrition_profiles" ADD CONSTRAINT "nutrition_profiles_body_profile_id_fkey" FOREIGN KEY ("body_profile_id") REFERENCES "body_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_profiles" ADD CONSTRAINT "training_profiles_body_profile_id_fkey" FOREIGN KEY ("body_profile_id") REFERENCES "body_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_preferences" ADD CONSTRAINT "coaching_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
