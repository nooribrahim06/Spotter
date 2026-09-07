import express from "express";

import { authenticateToken } from "../../middlewares/auth.middleware.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../middlewares/validatebody.js";
import * as controller from "./meal.controller.js";
import {
  createMealSchema,
  listMealsQuerySchema,
  mealIdParamSchema,
  replaceMealSchema,
} from "./meal.validate.js";

export const mealRoutes = express.Router();

mealRoutes.use(express.json({ limit: "100kb" }), authenticateToken);
// the qeuryparam are optional 
// if there is no query param, it will return all meals for the user
// if it is , it will be a date and we will return the meals of this date 
mealRoutes.get(
  "/",
  validateQuery(listMealsQuerySchema),
  controller.listMealsController
);

mealRoutes.get(
  "/:mealId",
  validateParams(mealIdParamSchema),
  controller.getMealByIdController
);
// create a new meal for the user 
// we will create it from food and recipes only OR quick log 
mealRoutes.post(
  "/",
  validateBody(createMealSchema),
  controller.createMealController
);

mealRoutes.put(
  "/:mealId",
  validateParams(mealIdParamSchema),
  validateBody(replaceMealSchema),
  controller.replaceMealController
);

mealRoutes.delete(
  "/:mealId",
  validateParams(mealIdParamSchema),
  controller.deleteMealController
);
