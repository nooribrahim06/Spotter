import * as progressService from "./progress.service.js";

function privateResponse(res, statusCode, data) {
  res.set("Cache-Control", "no-store");
  return res.status(statusCode).json({ data });
}

export async function createProgressEntry(req, res) {
    const progressEntry = await progressService.createProgressEntry(req.validatedBody, req.user.id);
    return privateResponse(res, 201, progressEntry);
} 

export async function getProgressHistory(req, res) {
    const progressHistory = await progressService.getProgressHistory(req.user.id, req.validatedQuery);
    return privateResponse(res, 200, progressHistory);
}

export async function getLatestProgressEntry(req, res) {
    const latestProgressEntry = await progressService.getLatestProgressEntry(req.user.id);
    return privateResponse(res, 200, latestProgressEntry);
}

export async function getProgressEntryById(req, res) {
    const progressEntry = await progressService.getProgressEntryById(req.user.id, req.validatedParams.entryId);
    return privateResponse(res, 200, progressEntry);
}