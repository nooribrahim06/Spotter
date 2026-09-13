// Progress check-ins are append-only. A new entry updates the user's current
// body state while preserving the history used for trends and goal progress.

import express from "express";
import { authenticateToken } from "../../middlewares/auth.middleware.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../middlewares/validatebody.js";
import {
  createProgressSchema,
  progressEntryParamsSchema,
  progressHistoryQuerySchema,
} from "./progress.validate.js";
import * as controller from "./progress.controller.js";

export const progressRoutes = express.Router();
progressRoutes.use(express.json({ limit: "100kb" }), authenticateToken);

progressRoutes.post(
  "/",
  validateBody(createProgressSchema),
  controller.createProgressEntry
);

// Purpose: View paginated check-in history.
// Query Params: page, limit, optional date range (startDate, endDate).
// Response: List of check-ins sorted by recordedAt DESC with pagination metadata.
progressRoutes.get(
  "/",
  validateQuery(progressHistoryQuerySchema),
  controller.getProgressHistory
);

// Get the newest check-in for profile views and quick comparisons.
progressRoutes.get("/latest", controller.getLatestProgressEntry);

// Calculated progress from the goal's starting weight to the latest weight.
progressRoutes.get("/goal-progress", controller.getGoalProgress);

// View one owned check-in with all measurements and notes.
progressRoutes.get(
  "/:entryId",
  validateParams(progressEntryParamsSchema), 
  controller.getProgressEntryById
);

// There is intentionally no update or delete endpoint. Check-ins preserve the
// measurement timeline; a later check-in records the next body state.
