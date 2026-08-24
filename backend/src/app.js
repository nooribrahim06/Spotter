import express from "express";
import path from "node:path";
import { authRoutes } from "./modules/auth/auth.routes.js";
import cookieParser from "cookie-parser";
export const app = express();
app.use(cookieParser());

// MiddleWares 
// 1. rate limiter 
// All requests beginning with /api/auth go to authRoutes
app.use("/api/auth", authRoutes);


// must be global error handler, because it will catch all errors from all routes,
//  and it must be after all routes, because it will catch errors from all routes.

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err); // a rare case where the header is sent before we reach that point 
    // in that case, we just pass the error to the default express error handler
    // we cannot change the staus code or send a response, because the header is already sent.
    // and we will get ERR_HTTP_HEADERS_SENT error if we try to send a response after the header is sent.
  }

  console.error(err);

  const invalidJson = err.type === "entity.parse.failed";
  const toolarge = err.type === "entity.too.large";
  const isOperational = err.isOperational === true;

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

  return res.status(statusCode).json({
    error: message,
    code,
  });
});
