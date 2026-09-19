import express from "express";
import { authenticateToken } from "../../middlewares/auth.middleware.js";
import { validateQuery, validateBody, validateParams } from "../../middlewares/validatebody.js";
import * as controller from "./plan.controller.js";
import { planContextQuerySchema, generatePlanSchema, planListQuerySchema, planIdParamSchema, activatePlanSchema } from "./plan.validate.js";
import { planGenerationRateLimiter } from "../../middlewares/rateLimiter.js";

export const planRoutes = express.Router();

planRoutes.use(express.json({ limit: "100kb" }), authenticateToken);
// the req body contaians the plan id that was active when the user reviewed this draft
// or null if none was active. The server will check that the plan is still active and owned by the user
// before activating the new plan.
planRoutes.post("/:planId/activate",
  validateParams(planIdParamSchema),
  validateBody(activatePlanSchema),
  controller.activatePlan);

// End an active plan
planRoutes.post("/:planId/end",
  validateParams(planIdParamSchema),
  validateQuery(planContextQuerySchema),
  controller.endPlan);

// Discard a draft plan
planRoutes.post("/:planId/discard",
  validateParams(planIdParamSchema),
  validateQuery(planContextQuerySchema),
  controller.discardPlan);
// simply reyturn all plans for the user with pagination and filtering

// the returend structure is { items: [plan], pagination: { page, limit, totalItems, totalPages, hasNextPage } }
// where the plan as a item has a less more structure than the plan returned by getPlanById, it does not include the plan details, only the plan metadata
planRoutes.get("/", 
  validateQuery(planListQuerySchema),
   controller.listPlans);
// simply return the active plan for the user

// not a summary , but a detailed plan with all the plan details, including the days and workouts
planRoutes.get("/active",
   validateQuery(planContextQuerySchema), 
   controller.getActivePlan);

// GET /api/plans/context: readiness, missing answers, and target preview.
planRoutes.get(
  "/context",
  validateQuery(planContextQuerySchema),
  controller.getPlanContext
);

// POST /api/plans/generate
planRoutes.post(
  "/generate",
  planGenerationRateLimiter,
  validateBody(generatePlanSchema),
  controller.generatePlan
);

// Static paths above must take precedence over a plan ID.
// we validate the planId param to be a valid UUID, so we don't have to worry about conflicts with other routes
// and we validate the planContextQuerySchema to be an empty object 
planRoutes.get("/:planId", 
  validateParams(planIdParamSchema),
  validateQuery(planContextQuerySchema),
   controller.getPlanById);
