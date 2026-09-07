import express from "express";

import { authenticateToken } from "../../middlewares/auth.middleware.js";
import {
  validateBody,
  validateQuery,
} from "../../middlewares/validatebody.js";
import * as controller from "./food.controller.js";
import {
  createCustomFoodSchema,
  getFoodsQuerySchema,
} from "./food.validate.js";

export const foodRoutes = express.Router();

foodRoutes.use(express.json({ limit: "100kb" }), authenticateToken);

// The initial view contains recent foods and the user's custom foods only.
// Catalog search will be added as a separate endpoint.
foodRoutes.get("/", controller.getFoodOverviewController);

foodRoutes.get(
  "/search",
  validateQuery(getFoodsQuerySchema),
  controller.searchFoodController
);

foodRoutes.post(
  "/custom",
  validateBody(createCustomFoodSchema),
  controller.createCustomFoodController
);
