import * as authService from "./auth.service.js";

export async function signupController(req, res, next) {
  try {
    const result = await authService.signup(req.validatedBody);

    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}