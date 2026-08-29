import express from "express";

import { authenticateToken } from "../../middlewares/auth.middleware.js";
import * as controllers from "./onboarding.controller.js";
import { validateOnboardingStep } from "./onboarding.validation.js";

export const onboardingRoutes = express.Router();

// every onboarding route needs JSON parsing and a logged-in user.
// authenticateToken is also gonna attach the full user to req.user,
// so the controller does not need to search for the user id by itself.
onboardingRoutes.use(express.json(), authenticateToken);

// the frontend expects this route to return the allowed enum values and limits.
// it has no request body because the frontend is only asking what it may send.
// expected response:
// {
//   goalTypes: ["LOSE_WEIGHT", "MAINTAIN_WEIGHT", "GAIN_WEIGHT", ...],
//   activityLevels: ["SEDENTARY", "LIGHTLY_ACTIVE", ...],
//   sexForCalculationOptions: ["MALE", "FEMALE"],
//   unitSystems: ["METRIC", "IMPERIAL"],
//   constraints: { minimumAge: 18, maximumAge: 100, ... }
// }
onboardingRoutes.get("/config", controllers.getOnboardingConfigController);

// if the user refreshes the page or comes back later, this route is gonna
// return his current step and everything he already saved.
onboardingRoutes.get("/", controllers.getOnboardingController);

// steps 1 and 2 use the same PATCH route. the body tells us which step is
// being saved, then validateOnboardingStep chooses the correct schema.
onboardingRoutes.patch(
  "/",
  validateOnboardingStep,
  controllers.saveOnboardingController
);

// step 3 is only the final confirmation screen, so it does not save another
// form. it checks the saved data, activates the goal, and completes onboarding.
onboardingRoutes.post("/complete", controllers.completeOnboardingController);
