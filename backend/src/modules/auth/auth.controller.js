import * as authService from "./auth.service.js";
import { env } from "../../config/env.js";
import { InvalidSessionError } from "../../middlewares/errorHandling.js";
// we will use this as a header for the refresh token cookie, so that we can set the cookie options in one place and use it in multiple places.
// the base will be needed for clearing the cookie, and the options will be needed for setting the cookie.
export function getRefreshCookieBaseOptions(nodeEnv = env.NODE_ENV) {
  const isProduction = nodeEnv === "production";

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    partitioned: isProduction,
    path: "/",
  };
}

const refreshCookieBaseOptions = getRefreshCookieBaseOptions();

const refreshCookieOptions = {
  ...refreshCookieBaseOptions,
  maxAge: env.REFRESH_TOKEN_EXPIRATION * 24 * 60 * 60 * 1000,
};





export async function signupController(req, res) {
  const result = await authService.signup(req.validatedBody);
  return res.status(201).json(result);
}

export async function verifyController(req, res) {
  const result = await authService.verifyEmail(req.validatedBody.token);
  return res.status(200).json(result);
}

export async function resendVerificationController(req, res) {
  const result = await authService.resendVerificationEmail(
    req.validatedBody.email
  );

  return res.status(200).json(result);
}

export async function loginController(req, res) {
  res.set("Cache-Control", "no-store"); // it controls the caching behavior of the response, 
  // and "no-store" means that the response should not be cached anywhere, not even in the browser's memory.
  //  This is important for sensitive data like authentication tokens, as we don't want them to be stored in any cache.
  const result = await authService.login({ email: req.validatedBody.email,
     password: req.validatedBody.password,
    userAgent: req.headers["user-agent"] || "unknown",
    ip: req.ip || req.connection.remoteAddress || "unknown"
    });    
    

        res.cookie("refreshToken", result.refreshToken, refreshCookieOptions);

        res.status(200).json({
            status: "success",
            user: result.user,
            accessToken: result.accessToken
        });
}

export async function refreshController(req, res, next) {
  const refreshToken = req.cookies?.refreshToken;

  // Without this, hashRefreshToken(undefined) may crash.
  if (!refreshToken) {
    return next(new InvalidSessionError());
  }
  

  try {
    const result = await authService.refreshToken(refreshToken);

    res.set("Cache-Control", "no-store");
    res.cookie("refreshToken", result.refreshToken, refreshCookieOptions);

    return res.json({
      user: result.user,
      accessToken: result.accessToken,
    });
  } catch (error) {
    const tokenIsUnusable = [
    "INVALID_REFRESH_TOKEN",
    "INVALID_SESSION",
    "REFRESH_TOKEN_THEFT_DETECTED",
  ].includes(error.code);

  if (tokenIsUnusable) {
    res.clearCookie("refreshToken", refreshCookieBaseOptions);
  }

  return next(error);
  }
}

export async function logoutController(req, res) {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (refreshToken) {
      await authService.logout(refreshToken);
    }
  } finally { // finally diff from catch is that it will always run, whether the try block succeeds or fails.
    res.clearCookie("refreshToken", refreshCookieBaseOptions);
  }

  return res.status(200).json({
    message: "Logged out successfully.",
  });
}

export async function logoutAllController(req, res) {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (refreshToken) {
      await authService.logoutAllSessions(refreshToken);
    }
  } finally {
    res.clearCookie("refreshToken", refreshCookieBaseOptions);
  }

  return res.status(200).json({
    message: "Logged out of all sessions successfully.",
  });
}

export async function getMeController(req, res) {
  const user = req.user;

  return res.status(200).json({
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      firstName: user.userProfile?.firstName ?? null,
      lastName: user.userProfile?.lastName ?? null,
      emailVerified: user.emailVerified,
      onboardingStatus: user.onboardingStatus.toLowerCase(),
      onboardingStep: user.onboardingStep,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
  });
}
