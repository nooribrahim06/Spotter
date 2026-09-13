import express from "express";

import { authenticateToken } from "../../middlewares/auth.middleware.js";
import {
  validateBody,
  validateParams,
} from "../../middlewares/validatebody.js";
import * as controller from "./workoutExercise.controller.js";
import {
  addWorkoutExerciseSchema,
  updateWorkoutExerciseSchema,
  workoutExerciseCollectionParamsSchema,
  workoutExerciseParamsSchema,
} from "./workoutExercise.validate.js";
// mergeParams = 1 , because we have nested routes , so we need to access both params 
// the workouts params is the workoutId and the workoutExercise params is the workoutExerciseId
// without it , the default is flase and we will only have access to the childs params 

// for example if we have a route like this : /api/workouts/:workoutId/exercises/:workoutExerciseId
// we will only have access to the workoutExerciseId param and not the workoutId param
// because the workoutExerciseRoutes is a child of the workoutRoutes and the default is false
// so we need to set it to true to have access to both params
export const workoutExerciseRoutes = express.Router({ mergeParams: true });

workoutExerciseRoutes.use(
  express.json({ limit: "100kb" }),
  authenticateToken
);
// Add an active catalog exercise to an active workout.
// the workout it self is already created , we just add exercises to it
// the buisness rules are 
// 1.The workout must exist, be owned, and be IN_PROGRESS.
// 2.The exercise must exist and have isActive: true.
//3.The same exercise may appear only once in a workout.
// 4.A workout may contain at most 50 exercises.
// 5.exerciseOrder is server-controlled.
// 6.A new exercise is appended after the current last exercise.
// 7.completed defaults to false.
// 8. Exercise.trackingMetrics controls the required measurement fields.
//    Every configured metric must be supplied, and other non-null measurement
//    fields are rejected. The backend loads these metrics from the catalog; it
//    never trusts a trackingMetrics array submitted by the client.
//The client cannot submit:- id this is in the params and is the workoutExerciseId
//- workoutId
//- exerciseOrder
//- completed
//- Exercise catalog information

// 9.Creation and next-order calculation must happen safely inside a transaction.
workoutExerciseRoutes.post(
  "/",
  validateParams(workoutExerciseCollectionParamsSchema),
  validateBody(addWorkoutExerciseSchema),
  controller.addWorkoutExerciseController
);

workoutExerciseRoutes.patch(
  "/:workoutExerciseId",
  validateParams(workoutExerciseParamsSchema),
  validateBody(updateWorkoutExerciseSchema),
  controller.updateWorkoutExerciseController
);

workoutExerciseRoutes.delete(
  "/:workoutExerciseId",
  validateParams(workoutExerciseParamsSchema),
  controller.deleteWorkoutExerciseController
);
