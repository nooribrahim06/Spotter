-- A catalog exercise may appear only once in a workout.
CREATE UNIQUE INDEX "workout_exercises_workout_id_exercise_id_key"
ON "workout_exercises"("workout_id", "exercise_id");
