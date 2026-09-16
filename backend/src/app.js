import express from "express";


import { authRoutes } from "./modules/auth/auth.routes.js";
import { dailySummaryRoutes } from "./modules/daily-summary/dailySummary.routes.js";
import { exerciseRoutes } from "./modules/exercises/exercise.routes.js";
import { foodRoutes } from "./modules/foods/food.routes.js";
import { goalRoutes } from "./modules/goals/goal.routes.js";
import { mealRoutes } from "./modules/meals/meal.routes.js";
import { onboardingRoutes } from "./modules/on-boarding/onboarding.routes.js";
import { planRoutes } from "./modules/plans/plan.routes.js";
import { profileRoutes } from "./modules/profiles/profile.routes.js";
import { recipeRoutes } from "./modules/recipes/recipe.routes.js";
import { progressRoutes } from "./modules/progress/progress.routes.js";
import { workoutExerciseRoutes } from "./modules/workout-exercises/workoutExercise.routes.js";
import { workoutRoutes } from "./modules/workouts/workout.routes.js";



import cookieParser from "cookie-parser";
import cors from "cors";
import { env } from "./config/env.js";
import { apiRateLimiter } from "./middlewares/rateLimiter.js";

export const app = express();

app.use(cors({
  origin(requestOrigin, callback) {
    if (!requestOrigin || requestOrigin === env.FRONTEND_URL) {
      return callback(null, true);
    }

    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(cookieParser());

// Apply one broad IP-based ceiling to every API endpoint. Authentication
// routes add stricter limits for credential and verification actions.
app.use("/api", apiRateLimiter);

app.use("/api/auth", authRoutes);

app.use("/api/daily-summary", dailySummaryRoutes);

app.use("/api/exercises", exerciseRoutes);

app.use("/api/onboarding", onboardingRoutes);

app.use("/api/profiles", profileRoutes);

app.use("/api/goals", goalRoutes);

app.use("/api/plans", planRoutes);

app.use("/api/foods", foodRoutes);

app.use("/api/recipes", recipeRoutes);


app.use("/api/progress", progressRoutes);

app.use("/api/meals", mealRoutes);
// Nested routes for workout exercises under workouts
// we must but it before the workout routes, 
// because the workout routes will catch all requests to /api/workouts/:workoutId/exercises 
// and will not reach the workoutExerciseRoutes.
app.use("/api/workouts/:workoutId/exercises", workoutExerciseRoutes);

app.use("/api/workouts", workoutRoutes);

// must be global error handler, because it will catch all errors from all routes,
//  and it must be after all routes, because it will catch errors from all routes.

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err); // a rare case where the header is sent before we reach that point 
    // in that case, we just pass the error to the default express error handler
    // we cannot change the staus code or send a response, because the header is already sent.
    // and we will get ERR_HTTP_HEADERS_SENT error if we try to send a response after the header is sent.
  }

  const invalidJson = err.type === "entity.parse.failed";
  const toolarge = err.type === "entity.too.large";
  const isOperational = err.isOperational === true;

  if (env.NODE_ENV !== "test") {
    if (!isOperational || err.statusCode >= 500) {
      console.error(err);
    } else if (err.code === "REFRESH_TOKEN_THEFT_DETECTED") {
      console.warn(`[SECURITY] ${err.code}: ${err.message}`);
    }
  }

  const statusCode = invalidJson
    ? 400
    : toolarge
      ? 413
      : isOperational
      ? err.statusCode
      : 500;

  const code = invalidJson
    ? "INVALID_JSON"
    : toolarge
      ? "ENTITY_TOO_LARGE"
      : isOperational
        ? err.code
        : "INTERNAL_SERVER_ERROR";

  const message = invalidJson
    ? "Request body contains invalid JSON."
    : toolarge
      ? "Request body is too large."
      : isOperational
        ? err.message
        : "Internal Server Error";

  const responseBody = {
    error: message,
    code,
  };

  if (isOperational && err.details !== null) {
    responseBody.details = err.details;
  }

  return res.status(statusCode).json(responseBody);
});
