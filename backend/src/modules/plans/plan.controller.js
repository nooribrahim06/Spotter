import * as planService from "./plan.service.js";

export async function activatePlan(req, res) {
  const plan = await planService.activatePlan(req.user.id, req.validatedParams.planId, req.validatedBody);
  res.set("Cache-Control", "no-store");
  return res.status(200).json({ data: plan });
}

export async function endPlan(req, res) {
  const plan = await planService.endActivePlan(req.user.id, req.validatedParams.planId);
  res.set("Cache-Control", "no-store");
  return res.status(200).json({ data: plan });
}

export async function discardPlan(req, res) {
  const plan = await planService.discardDraftPlan(req.user.id, req.validatedParams.planId);
  res.set("Cache-Control", "no-store");
  return res.status(200).json({ data: plan });
}

export async function listPlans(req, res) {
  const result = await planService.listPlans(req.user.id, req.validatedQuery);
  res.set("Cache-Control", "no-store");
  return res.status(200).json({ data: result });
}

export async function getActivePlan(req, res) {
  const result = await planService.getActivePlan(req.user.id);
  res.set("Cache-Control", "no-store");
  return res.status(200).json({ data: result });
}

export async function getPlanById(req, res) {
  const result = await planService.getPlanById(req.user.id, req.validatedParams.planId);
  res.set("Cache-Control", "no-store");
  return res.status(200).json({ data: result });
}

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
