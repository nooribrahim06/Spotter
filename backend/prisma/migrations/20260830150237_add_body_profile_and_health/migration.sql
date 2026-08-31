/*
  Warnings:

  - You are about to drop the column `activity_level` on the `user_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `adult_confirmed_at` on the `user_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `birth_day` on the `user_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `birth_month` on the `user_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `birth_year` on the `user_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `height_cm` on the `user_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `preferred_unit_system` on the `user_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `sex_for_calculation` on the `user_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `starting_weight_kg` on the `user_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `first_name` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `last_name` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "user_profiles" DROP COLUMN "activity_level",
DROP COLUMN "adult_confirmed_at",
DROP COLUMN "birth_day",
DROP COLUMN "birth_month",
DROP COLUMN "birth_year",
DROP COLUMN "height_cm",
DROP COLUMN "preferred_unit_system",
DROP COLUMN "sex_for_calculation",
DROP COLUMN "starting_weight_kg",
ADD COLUMN     "bio" VARCHAR(500),
ADD COLUMN     "display_name" VARCHAR(100),
ADD COLUMN     "first_name" VARCHAR(100),
ADD COLUMN     "last_name" VARCHAR(100),
ADD COLUMN     "profile_photo_key" VARCHAR(512);

-- AlterTable
ALTER TABLE "users" DROP COLUMN "first_name",
DROP COLUMN "last_name";

-- CreateTable
CREATE TABLE "body_profiles" (
    "user_id" UUID NOT NULL,
    "birth_date" DATE NOT NULL,
    "adult_confirmed_at" TIMESTAMPTZ(6) NOT NULL,
    "sex_for_calculation" "SexForCalculation" NOT NULL,
    "preferred_unit_system" "UnitSystem" NOT NULL,
    "height_cm" DECIMAL(5,2) NOT NULL,
    "starting_weight_kg" DECIMAL(6,2) NOT NULL,
    "activity_level" "ActivityLevel",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "body_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "health_profiles" (
    "body_profile_id" UUID NOT NULL,
    "health_conditions" JSONB,
    "movement_limitations" JSONB,
    "special_planning_states" JSONB,
    "requires_professional_clearance" BOOLEAN NOT NULL DEFAULT false,
    "safety_notes" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "health_profiles_pkey" PRIMARY KEY ("body_profile_id")
);

-- AddForeignKey
ALTER TABLE "body_profiles" ADD CONSTRAINT "body_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_profiles" ADD CONSTRAINT "health_profiles_body_profile_id_fkey" FOREIGN KEY ("body_profile_id") REFERENCES "body_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
