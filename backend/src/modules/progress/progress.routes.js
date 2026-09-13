// we just need to add the progress to the workout exercise and we will not have any other logic here
// once the progress is added and saved . no edit , delete or update is allowed. the progress is final and cannot be changed. if the user wants to change the progress
// they add a new one , simple 

import express from "express";
import { authenticateToken } from "../../middlewares/auth.middleware.js";
import { validateBody, validateParams , validateQuery } from "../../middlewares/validatebody.js";
import { createProgressSchema , progressHistoryQuerySchema , progressEntryParamsSchema} from "./progress.validate.js";
import * as controller from "./progress.controller.js";

export const progressRoutes = express.Router();
progressRoutes.use(express.json({ limit: "100kb" }), authenticateToken);

progressRoutes.post(
    "/",
    validateBody(createProgressSchema),
    controller.createProgressEntry
)
// Purpose: View paginated check-in history.
// Query Params: page, limit, optional date range (startDate, endDate).
// Response: List of check-ins sorted by recordedAt DESC with pagination metadata.
progressRoutes.get(
    "/",
    validateQuery(progressHistoryQuerySchema),
    controller.getProgressHistory
)
// GET /api/progress/latest
//Purpose: Get the single most recent check-in (used for profile views and quick comparisons).
progressRoutes.get(
    "/latest",
    controller.getLatestProgressEntry)
//GET /api/progress/:entryId

//Purpose: View details of a specific check-in (with all measurements and notes).
progressRoutes.get(
    "/:entryId",
    validateParams(progressEntryParamsSchema),
    controller.getProgressEntryById
)
// i refuse to implement this endpoint because it is not a good idea to allow users to delete their progress entries.
//  it will create a lot of problems and inconsistencies in the data. if the user wants to delete their progress entry,
//  they can just create a new one with the correct data. this way we keep the history of the progress entries and we can track the progress over time.
//  also, if we allow users to delete their progress entries, we will have to implement a lot of logic to handle the deletion of the related data
//  (e.g. measurements, notes, etc.) and this will create a lot of complexity in the codebase. 
// so i will not implement this endpoint and i will not allow users to delete their progress entries.
//DELETE /api/progress/:entryId
//Purpose: Delete a check-in entry (cannot delete if it's the initial entry for a goal: isInitialForGoal = true).