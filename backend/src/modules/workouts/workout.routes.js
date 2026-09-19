import express from "express";

import { authenticateToken } from "../../middlewares/auth.middleware.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../middlewares/validatebody.js";
import {
  cancelWorkoutController,
  completeWorkoutController,
  createWorkoutController,
  getActiveWorkoutController,
  getWorkoutByIdController,
  getWorkoutHistoryController,
  updateWorkoutController,
  startWorkoutFromPlanController,
} from "./workout.controller.js";
import {
  createWorkoutSchema,
  updateWorkoutSchema,
  workoutActionSchema,
  workoutHistoryQuerySchema,
  workoutIdParamSchema,
  startWorkoutFromPlanSchema,
} from "./workout.validate.js";

export const workoutRoutes = express.Router();

workoutRoutes.use(express.json({ limit: "100kb" }), authenticateToken);

workoutRoutes.post(
  "/",
  validateBody(createWorkoutSchema),
  createWorkoutController
);

workoutRoutes.post(
  "/from-plan",
  validateBody(startWorkoutFromPlanSchema),
  startWorkoutFromPlanController
);

workoutRoutes.get("/active", getActiveWorkoutController);

workoutRoutes.get(
  "/history",
  validateQuery(workoutHistoryQuerySchema),
  getWorkoutHistoryController
);

workoutRoutes.patch(
  "/:workoutId",
  validateParams(workoutIdParamSchema),
  validateBody(updateWorkoutSchema),
  updateWorkoutController
);

workoutRoutes.post(
  "/:workoutId/complete",
  validateParams(workoutIdParamSchema),
  validateBody(workoutActionSchema),
  completeWorkoutController
);

workoutRoutes.post(
  "/:workoutId/cancel",
  validateParams(workoutIdParamSchema),
  validateBody(workoutActionSchema),
  cancelWorkoutController
);

workoutRoutes.get(
  "/:workoutId",
  validateParams(workoutIdParamSchema),
  getWorkoutByIdController
);
