import express from "express";
import { signupRateLimiter } from "../../middlewares/rateLimiter.js";
import { validateBody } from "../../middlewares/validatebody.js";
import { signupSchema } from "./auth.validation.js";
import { signupController } from "./auth.controller.js";


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