import express from "express";
import { authenticateToken } from "../../middlewares/auth.middleware.js";
import { validateQuery , validateBody } from "../../middlewares/validatebody.js";
import * as controller from "./plan.controller.js";
import { planContextQuerySchema , generatePlanSchema } from "./plan.validate.js";

export const planRoutes = express.Router();

planRoutes.use(express.json({ limit: "100kb" }), authenticateToken);

// GET /api/plans/context: readiness, missing answers, and target preview.
planRoutes.get(
  "/context",
  validateQuery(planContextQuerySchema),
  controller.getPlanContext
);

// POST /api/plans/generate
planRoutes.post(
  "/generate",
  validateBody(generatePlanSchema),
  controller.generatePlan
);
