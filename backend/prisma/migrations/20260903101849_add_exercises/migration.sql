/*
  Warnings:

  - A unique constraint covering the columns `[user_id]` on the table `goals` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ExerciseType" AS ENUM ('STRENGTH', 'CARDIO', 'MOBILITY');

-- CreateEnum
CREATE TYPE "ExerciseBodyPart" AS ENUM ('ARMS', 'BACK', 'CALVES', 'CHEST', 'CORE', 'FULL_BODY', 'GLUTES', 'LEGS', 'SHOULDERS');

-- CreateEnum
CREATE TYPE "ExerciseDifficulty" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'EXPERT');

-- CreateEnum
CREATE TYPE "ExerciseForce" AS ENUM ('PUSH', 'PULL', 'STATIC');

-- CreateEnum
CREATE TYPE "ExerciseMechanic" AS ENUM ('COMPOUND', 'ISOLATION');

-- CreateEnum
CREATE TYPE "ExerciseEquipment" AS ENUM ('BARBELL', 'BODY_WEIGHT', 'CABLE', 'DUMBBELL', 'JUMP_ROPE', 'KETTLEBELL', 'MACHINE', 'RESISTANCE_BAND');

-- CreateTable
CREATE TABLE "exercises" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "exercise_type" "ExerciseType" NOT NULL,
    "body_part" "ExerciseBodyPart" NOT NULL,
    "difficulty" "ExerciseDifficulty" NOT NULL,
    "force" "ExerciseForce",
    "mechanic" "ExerciseMechanic",
    "equipment" "ExerciseEquipment" NOT NULL,
    "primary_muscles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "secondary_muscles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "instructions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "image_key" VARCHAR(255),
    "gif_key" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exercises_slug_key" ON "exercises"("slug");

-- CreateIndex
CREATE INDEX "exercises_body_part_idx" ON "exercises"("body_part");

-- CreateIndex
CREATE INDEX "exercises_equipment_idx" ON "exercises"("equipment");

-- CreateIndex
CREATE INDEX "exercises_difficulty_idx" ON "exercises"("difficulty");

-- CreateIndex
CREATE INDEX "exercises_exercise_type_idx" ON "exercises"("exercise_type");

-- CreateIndex
CREATE INDEX "exercises_is_active_idx" ON "exercises"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "one_active_goal_per_user" ON "goals"("user_id") WHERE (status = 'ACTIVE');
