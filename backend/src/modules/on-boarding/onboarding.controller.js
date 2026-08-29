import * as onboardingService from "./onboarding.service.js";

// controller job here is simple: receive the request, call the service,
// and send the service response. the config itself lives in config/onboarding.js.
export function getOnboardingConfigController(req, res) {
  return res.status(200).json(onboardingService.getOnboardingConfig());
}

// Cache-Control: no-store because this response contains personal fitness data.
// we do not want a browser or proxy to keep an old copy of it.
export async function getOnboardingController(req, res) {
  res.set("Cache-Control", "no-store");
  const result = await onboardingService.getUserOnboarding(req.user.id);
  return res.status(200).json(result);
}

// req.validatedBody is safe to use here because the validation middleware
// already rejected unknown steps, unknown fields, and invalid values.
export async function saveOnboardingController(req, res) {
  res.set("Cache-Control", "no-store");
  const { step, data } = req.validatedBody;
  const result = await onboardingService.saveOnboardingStep(
    req.user.id,
    step,
    data
  );
  return res.status(200).json(result);
}

// there is no step 3 body to validate. the service is gonna check the saved
// profile and goal before it allows the user to finish.
export async function completeOnboardingController(req, res) {
  res.set("Cache-Control", "no-store");
  const result = await onboardingService.completeOnboarding(req.user.id);
  return res.status(200).json(result);
}
