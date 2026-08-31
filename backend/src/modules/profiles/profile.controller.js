import * as profileService from "./profile.service.js";

function privateResponse(res, statusCode, data) {
  res.set("Cache-Control", "no-store");
  return res.status(statusCode).json({ data });
}

export function getProfileConfigController(req, res) {
  return res.status(200).json({ data: profileService.getProfileConfig() });
}

export async function getMyProfileController(req, res) {
  const result = await profileService.getMyProfile(req.user.id);
  return privateResponse(res, 200, result);
}

export async function updateMyPublicProfileController(req, res) {
  const result = await profileService.updateMyPublicProfile(
    req.user.id,
    req.validatedBody
  );
  return privateResponse(res, 200, result);
}

export async function updateMyAccountPreferencesController(req, res) {
  const result = await profileService.updateMyAccountPreferences(
    req.user.id,
    req.validatedBody
  );
  return privateResponse(res, 200, result);
}

export async function createMyBodyProfileController(req, res) {
  const result = await profileService.createMyBodyProfile(
    req.user.id,
    req.validatedBody
  );
  return privateResponse(res, 201, result);
}

export async function updateMyBodyProfileController(req, res) {
  const result = await profileService.updateMyBodyProfile(
    req.user.id,
    req.validatedBody
  );
  return privateResponse(res, 200, result);
}

export async function replaceMyHealthProfileController(req, res) {
  const result = await profileService.replaceMyHealthProfile(
    req.user.id,
    req.validatedBody
  );
  return privateResponse(res, 200, result);
}

export async function replaceMyNutritionProfileController(req, res) {
    // we must make sure the body profile exists before replacing the nutrition profile, 
    // because the nutrition profile is linked to the body profile, so if the body profile does not exist,
    //  then we cannot replace the nutrition profile.
  const result = await profileService.replaceMyNutritionProfile(
    req.user.id,
    req.validatedBody
  );
  return privateResponse(res, 200, result);
}

export async function replaceMyTrainingProfileController(req, res) {
  const result = await profileService.replaceMyTrainingProfile(
    req.user.id,
    req.validatedBody
  );
  return privateResponse(res, 200, result);
}

export async function replaceMyCoachingPreferencesController(req, res) {
  const result = await profileService.replaceMyCoachingPreferences(
    req.user.id,
    req.validatedBody
  );
  return privateResponse(res, 200, result);
}

export async function addMyProgressEntryController(req, res) {
  const result = await profileService.addMyProgressEntry(
    req.user.id,
    req.validatedBody
  );
  return privateResponse(res, 201, result);
}

export async function getMyTargetsController(req, res) {
  const result = await profileService.getMyTargets(req.user.id);
  return privateResponse(res, 200, result);
}

export async function deleteMyBodyProfileController(req, res) {
  await profileService.deleteMyBodyProfile(
    req.user.id,
    req.validatedBody.password
  );
  return res.status(204).send();
}
