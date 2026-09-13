import express from "express";

import { authenticateToken } from "../../middlewares/auth.middleware.js";
import {
  validateParams,
  validateQuery,
} from "../../middlewares/validatebody.js";
import * as controller from "./exercise.controller.js";
import {
  exerciseIdParamSchema,
  listExercisesQuerySchema,
} from "./exercise.validate.js";

export const exerciseRoutes = express.Router();

exerciseRoutes.use(authenticateToken);

exerciseRoutes.get("/config", controller.getExerciseConfigController);

exerciseRoutes.get(
  "/",
  validateQuery(listExercisesQuerySchema),
  controller.listExercisesController
);

exerciseRoutes.get(
  "/:exerciseId",
  validateParams(exerciseIdParamSchema),
  controller.getExerciseByIdController
);
