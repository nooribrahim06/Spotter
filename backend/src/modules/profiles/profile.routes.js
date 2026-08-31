import express from "express";

import { authenticateToken } from "../../middlewares/auth.middleware.js";
import { validateBody } from "../../middlewares/validatebody.js";
import * as controllers from "./profile.controller.js";
import {
  accountPreferencesUpdateSchema,
  coachingPreferencesSchema,
  createBodyProfileSchema,
  createProgressEntrySchema,
  deleteBodyProfileSchema,
  healthProfileSchema,
  nutritionProfileSchema,
  publicProfileUpdateSchema,
  trainingProfileSchema,
  updateBodyProfileSchema,
} from "./profile.validation.js";

export const profileRoutes = express.Router();

profileRoutes.use(express.json({ limit: "100kb" }), authenticateToken);

/*
 * WHY ARE THERE MANY PROFILE ENDPOINTS?
 *
 * "The user's profile" is not one database object and it is not one permission
 * boundary. A Spotter user owns several categories of data with different
 * meanings, lifecycles, and safety rules:
 *
 * 1. User/account preferences
 *    Login identity and application-level preferences such as language,
 *    country, and timezone. Email, username, password, role, and verification
 *    are security/account actions and are intentionally not editable here.
 *
 * 2. UserProfile (public identity)
 *    Name, display name, bio, and eventually a safe profile-photo URL. Friends
 *    may see this data later, so private fitness or health facts never belong in
 *    this section.
 *
 * 3. BodyProfile (private stable facts)
 *    Birth date, calculation sex, preferred units, height, starting weight, and
 *    activity level. Starting weight is an immutable baseline. Current weight
 *    is not edited here; it comes from the latest ProgressEntry.
 *
 * 4. HealthProfile, NutritionProfile, and TrainingProfile
 *    These are separate one-to-one sections owned by BodyProfile. They are kept
 *    apart because health safety, dietary practicality, and training capacity
 *    are different inputs to plan generation. They use PUT because each request
 *    replaces its complete section: [] means "answered none" and null means
 *    "no value/clear this optional answer".
 *
 * 5. CoachingPreferences
 *    Controls how the AI coach communicates and whether proactive features are
 *    enabled. It belongs to the account, so deleting BodyProfile does not erase
 *    the user's communication preferences.
 *
 * 6. ProgressEntry
 *    Time-series observations such as current weight, body composition, heart
 *    rate, and circumference measurements. POST creates history; it must never
 *    overwrite the stable BodyProfile baseline.
 *
 * The routes are split so each request has a small, reviewable list of fields.
 * A generic PATCH /me would mix public, private, medical, account, and history
 * data and could accidentally allow mass assignment of role, ownership IDs, or
 * server-derived safety fields.
 *
 * Layer responsibilities:
 * - Route: chooses authentication, validation, and the matching controller.
 * - Validation: permits only the fields owned by that action.
 * - Controller: translates the service result into HTTP status/response shape.
 * - Service: applies business rules and coordinates transactions.
 * - Repository: performs explicitly scoped Prisma operations.
 * - Serializer: converts database-shaped values into the frontend contract.
 */

profileRoutes.get("/config", controllers.getProfileConfigController);

profileRoutes.get("/me", controllers.getMyProfileController);

profileRoutes.patch(
  "/me/public",
  validateBody(publicProfileUpdateSchema),
  controllers.updateMyPublicProfileController
);
profileRoutes.patch(
  "/me/account-preferences",
  validateBody(accountPreferencesUpdateSchema),
  controllers.updateMyAccountPreferencesController
);

profileRoutes.post(
  "/me/body",
  validateBody(createBodyProfileSchema),
  controllers.createMyBodyProfileController
);
profileRoutes.patch(
  "/me/body",
  validateBody(updateBodyProfileSchema),
  controllers.updateMyBodyProfileController
);
profileRoutes.delete(
  "/me/body",
  validateBody(deleteBodyProfileSchema),
  controllers.deleteMyBodyProfileController
);

profileRoutes.put(
  "/me/health",
  validateBody(healthProfileSchema),
  controllers.replaceMyHealthProfileController
);
profileRoutes.put(
  "/me/nutrition",
  validateBody(nutritionProfileSchema),
  controllers.replaceMyNutritionProfileController
);
profileRoutes.put(
  "/me/training",
  validateBody(trainingProfileSchema),
  controllers.replaceMyTrainingProfileController
);
profileRoutes.put(
  "/me/coaching",
  validateBody(coachingPreferencesSchema),
  controllers.replaceMyCoachingPreferencesController
);

profileRoutes.post(
  "/me/progress",
  validateBody(createProgressEntrySchema),
  controllers.addMyProgressEntryController
);
profileRoutes.get("/me/targets", controllers.getMyTargetsController);
