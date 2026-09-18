import * as planService from "./plan.service.js";

// Missing profile answers are a successful readiness response, not an error.
export async function getPlanContext(req, res) {
  const result = await planService.getPlanContext(req.user.id);
  res.set("Cache-Control", "no-store");
  return res.status(200).json({ data: result });
}
// genrate a plan for the user based on the plan context and the plan generation rules
export async function generatePlan(req, res) {
  const result = await planService.generatePlan(req.user.id, req.validatedBody);
  res.set("Cache-Control", "no-store");
  return res.status(201).json({ data: result });
}
