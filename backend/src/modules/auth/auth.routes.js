import express from "express";

import { authenticateToken } from "../../middlewares/auth.middleware.js";

import { rateLimiter } from "../../middlewares/rateLimiter.js";
import { signupRateLimiter } from "../../middlewares/rateLimiter.js";
import { verifyEmailRateLimiter } from "../../middlewares/rateLimiter.js";
import { loginRateLimiter } from "../../middlewares/rateLimiter.js";
import { resendVerificationRateLimiter } from "../../middlewares/rateLimiter.js";


import { validateBody } from "../../middlewares/validatebody.js";
import { signupSchema } from "./auth.validation.js";
import { verifySchema } from "./auth.validation.js";
import { loginSchema } from "./auth.validation.js";
import { resendVerificationSchema } from "./auth.validation.js";


import { signupController } from "./auth.controller.js";
import { verifyController } from "./auth.controller.js";
import { loginController } from "./auth.controller.js";
import { refreshController } from "./auth.controller.js";
import { logoutController } from "./auth.controller.js";
import { resendVerificationController } from "./auth.controller.js";

export const authRoutes = express.Router();
authRoutes.post("/signup",
     signupRateLimiter, 
     express.json(),
      validateBody(signupSchema),
       signupController
    );

    // so the req will be in this flow 
    // 1. the rate limiter 
    // 2. express.json() to parse the body
    // 3. validateBody to validate the body against the schema
    // 4. signupController to handle the signup logic

// verify Route 

authRoutes.post("/verify-email",
    verifyEmailRateLimiter, 
    express.json(),
    validateBody(verifySchema),
    verifyController
)

authRoutes.post(
    "/resend-verification",
    resendVerificationRateLimiter,
    express.json(),
    validateBody(resendVerificationSchema),
    resendVerificationController
);

authRoutes.post("/login", 
    // 1. rate limiter 
    loginRateLimiter,
    // 2. express.json() to parse the body
    express.json(),
    // 3. validateBody to validate the body against the schema
    validateBody(loginSchema),
    // 4. loginController to handle the login logic
    loginController
)
authRoutes.post("/refresh" , 
  rateLimiter,
  express.json(),
  refreshController
);

authRoutes.post("/logout",logoutController
)



authRoutes.get(
  "/protected",
  authenticateToken,
  (req, res) => {
    return res.status(200).json({
      message: "You are authenticated.",
      auth: req.auth,
    });
  }
);
