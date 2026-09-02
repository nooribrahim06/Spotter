import express from "express";

import { authenticateToken } from "../../middlewares/auth.middleware.js";
import { confirmActionController } from "../../middlewares/confirm.action.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../middlewares/validatebody.js";
import * as controller from "./recipe.controller.js";
import {
  createRecipeSchema,
  deleteRecipeSchema,
  recipeIdParamSchema,
  replaceRecipeSchema,
  searchRecipesQuerySchema,
} from "./recipe.validate.js";

export const recipeRoutes = express.Router();

recipeRoutes.use(express.json({ limit: "100kb" }), authenticateToken);

// Static routes must precede /:recipeId so "search" is never parsed as an ID.
recipeRoutes.get(
  "/search",
  validateQuery(searchRecipesQuerySchema),
  controller.searchRecipesController
);

recipeRoutes.get(
  "/:recipeId",
  validateParams(recipeIdParamSchema),
  controller.getRecipeByIdController
);

recipeRoutes.post(
  "/",
  validateBody(createRecipeSchema),
  controller.createRecipeController
);

recipeRoutes.put(
  "/:recipeId",
  validateParams(recipeIdParamSchema),
  validateBody(replaceRecipeSchema),
  controller.replaceRecipeController
);

recipeRoutes.delete(
  "/:recipeId",
  validateParams(recipeIdParamSchema),
  validateBody(deleteRecipeSchema),
  confirmActionController,
  controller.deleteRecipeController
);
