import { getDailySummary } from "./dailySummary.service.js";

export async function getDailySummaryController(req, res) {
  const summary = await getDailySummary(
    req.user.id,
    req.validatedQuery.date,
    req.user.timezone
  );

  res.set("Cache-Control", "no-store");
  return res.status(200).json({ data: summary });
}
