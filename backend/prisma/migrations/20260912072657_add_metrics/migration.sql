-- CreateEnum
CREATE TYPE "ExerciseTrackingMetric" AS ENUM ('SETS', 'REPS', 'WEIGHT', 'DURATION', 'DISTANCE');

-- AlterTable
ALTER TABLE "exercises" ADD COLUMN     "tracking_metric" "ExerciseTrackingMetric"[] DEFAULT ARRAY[]::"ExerciseTrackingMetric"[];
