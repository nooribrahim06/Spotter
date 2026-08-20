import express from "express";
import { signupRateLimiter } from "../../middlewares/rateLimiter.js";
import { validateBody } from "../../middlewares/validatebody.js";
import { signupSchema } from "./auth.validation.js";
import { signupController } from "./auth.controller.js";


export const authRoutes = express.Router();
authRoutes.post("/signup", signupRateLimiter, express.json(), validateBody(signupSchema), signupController);