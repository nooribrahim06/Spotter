import express from "express";
import { authenticateToken } from "../../middlewares/auth.middleware.js";
import {
  validateBody,
  validateParams,
} from "../../middlewares/validatebody.js";
import * as goalValidation from "./goal.validation.js";
import * as controllers from "./goal.controller.js";
/**
    this file will have the routes of goals 
    1. create a goal 
    POST /api/goals
    --> save an editable DRAFT after authentication and validation
    POST /api/goals/:goalId/activate
    --> activate that saved draft; a conflict leaves the draft unchanged
    2. get all goals of the user
    GET /api/goals
    3. get a specific goal of the user
    GET /api/goals/:goalId  
    4. get active goals only 
    GET /api/goals/active
    5. update a specific goal of the user
    PATCH /api/goals/:goalId 
    only DRAFT goals can be edited, including their goal type
    5. complete a specific goal of the user
    POST /api/goals/:goalId/complete
    only ACTIVE goals can be completed
    6. cancel a specific goal of the user
    POST /api/goals/:goalId/cancel
    DRAFT or ACTIVE goals can be cancelled

    the user canot delete a goal once created 
 */

export const goalRoutes = express.Router();

goalRoutes.use(express.json({ limit: "100kb" }), authenticateToken);

goalRoutes.post(
  "/",
  validateBody(goalValidation.createGoalSchema),
  controllers.createGoalController
);

goalRoutes.post(
  "/:goalId/activate",
  validateParams(goalValidation.goalIdParamSchema),
  controllers.activateGoalController
);


goalRoutes.get(
  "/",
  controllers.getAllGoalsController
);

goalRoutes.get(
  "/active",
  controllers.getActiveGoalController
);

goalRoutes.get(
  "/:goalId",
  validateParams(goalValidation.goalIdParamSchema),
  controllers.getGoalByIdController
);

goalRoutes.patch(
  "/:goalId",
  // patch has the goal ID in params and editable draft fields in the body
  // and the body will have the data to update
  validateParams(goalValidation.goalIdParamSchema),
  validateBody(goalValidation.updateGoalSchema),
  controllers.updateGoalController
);

goalRoutes.post(
  "/:goalId/complete",
  validateParams(goalValidation.goalIdParamSchema),
  controllers.completeGoalController
);

goalRoutes.post(
  "/:goalId/cancel",
  validateParams(goalValidation.goalIdParamSchema),
  controllers.cancelGoalController
);
