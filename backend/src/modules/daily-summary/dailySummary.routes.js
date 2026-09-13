import express from "express";

import { authenticateToken } from "../../middlewares/auth.middleware.js";
import { validateQuery } from "../../middlewares/validatebody.js";
import { getDailySummaryController } from "./dailySummary.controller.js";
import { dailySummaryQuerySchema } from "./dailySummary.validate.js";

export const dailySummaryRoutes = express.Router();

dailySummaryRoutes.get(
  "/",
  authenticateToken,
  validateQuery(dailySummaryQuerySchema),
  getDailySummaryController
);
