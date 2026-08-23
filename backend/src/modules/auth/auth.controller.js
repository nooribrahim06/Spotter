import * as authService from "./auth.service.js";

export async function signupController(req, res) {
  const result = await authService.signup(req.validatedBody);
  return res.status(201).json(result);
}

export async function verifyController(req, res) {
  const result = await authService.verifyEmail(req.validatedBody.token);
  return res.status(200).json(result);
}
