import express from "express";


import { authRoutes } from "./modules/auth/auth.routes.js";
import { goalRoutes } from "./modules/goals/goal.routes.js";
import { onboardingRoutes } from "./modules/on-boarding/onboarding.routes.js";
import { profileRoutes } from "./modules/profiles/profile.routes.js";


import cookieParser from "cookie-parser";
import cors from "cors";
import { env } from "./config/env.js";

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



// MiddleWares 
// 1. rate limiter 
// All requests beginning with /api/auth go to authRoutes
app.use("/api/auth", authRoutes);

app.use("/api/onboarding", onboardingRoutes);

app.use("/api/profiles", profileRoutes);

app.use("/api/goals", goalRoutes);

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
