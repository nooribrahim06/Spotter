import express from "express";
import path from "node:path";
import { authRoutes } from "./modules/auth/auth.routes.js";
export const app = express();

// MiddleWares 
// 1. rate limiter 
// All requests beginning with /api/auth go to authRoutes
app.use("/api/auth", authRoutes);

// Error middleware must be registered last

