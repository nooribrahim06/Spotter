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
    my buisness rules prevent editing a goal that is already completed or cancelled
    and when the goal is active , only specific range in any measur could be updated 
    like if the weight goal = 50 kg , the user cannot change it to 70 or 80 , impossible to achieve in a short time , but the user can change it to 52 or 53 kg
    5. complete a specific goal of the user
    PATCH /api/goals/:goalId/complete
    this is only called by me , i decide if the goal is completed or not , the user cannot complete a goal by himself
    later , when i add the AI model , the AI model will decide if the goal is completed or not based on the user progress and the user feedback
    6. cancel a specific goal of the user
    PATCH /api/goals/:goalId/cancel
    this is called by user if he want  , and by me if the target date is passed and there is no seen progress for a long time , the goal will be automatically cancelled by me

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
