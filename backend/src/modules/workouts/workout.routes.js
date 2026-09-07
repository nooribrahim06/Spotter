import express from "express";

import { authenticateToken } from "../../middlewares/auth.middleware.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../middlewares/validatebody.js";
import {
  createWorkoutController,
  getActiveWorkoutController,
  getWorkoutByIdController,
  getWorkoutHistoryController,
} from "./workout.controller.js";
import {
  createWorkoutSchema,
  workoutHistoryQuerySchema,
  workoutIdParamSchema,
} from "./workout.validate.js";

/**
 * we need to discuss the actions a user gonna make 
 * the user flow may be like this 
 * he selects a exercise from the list of exercises
 * then he can add it to his workout 
 * 
 * he cannot edit the exercise it self , but he can choose how many sets and reps he wants to do for that exercise
 * 
 * so for the workouts , w emay 
 * Create a workout with a list of exercises and their sets and reps
 * Update a workout by adding or removing exercises, or changing the sets and reps for an exercise
 * Delete a workout
 * 
 * serach a workout by date 
 * display the user history 
 * 
 * 
 * Crete a workout
 * POST   /workouts
 * Get the active ones 
* GET    /workouts/active
* Get the history of workouts
* GET    /workouts/history
* view a workout by it id 
* GET    /workouts/:workoutId
* edit it -> must be in_progress or not completed
PATCH  /workouts/:workoutId
POST   /workouts/:workoutId/complete
POST   /workouts/:workoutId/cancel
must be in_progress or not completed
DELETE /workouts/:workoutId
// those related to exercise repo 
POST   /workouts/:workoutId/exercises
PATCH  /workouts/:workoutId/exercises/:workoutExerciseId
DELETE /workouts/:workoutId/exercises/:workoutExerciseId
 */

export const workoutRoutes = express.Router();

workoutRoutes.use(express.json({ limit: "100kb" }), authenticateToken);

workoutRoutes.post(
  "/",
  validateBody(createWorkoutSchema),
  createWorkoutController
);

workoutRoutes.get("/active", getActiveWorkoutController);

workoutRoutes.get(
  "/history",
  validateQuery(workoutHistoryQuerySchema),
  getWorkoutHistoryController
);

workoutRoutes.get(
  "/:workoutId",
  validateParams(workoutIdParamSchema),
  getWorkoutByIdController
);
