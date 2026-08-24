import * as authService from "./auth.service.js";
import { env } from "../../config/env.js";


// we will use this as a header for the refresh token cookie, so that we can set the cookie options in one place and use it in multiple places.
// the base will be needed for clearing the cookie, and the options will be needed for setting the cookie.
const refreshCookieBaseOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
};

const refreshCookieOptions = {
  ...refreshCookieBaseOptions,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};





export async function signupController(req, res) {
  const result = await authService.signup(req.validatedBody);
  return res.status(201).json(result);
}

export async function verifyController(req, res) {
  const result = await authService.verifyEmail(req.validatedBody.token);
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
    return res.status(401).json({
      message: "Refresh token is missing",
    });
  }
  

  try {
    const result = await authService.refreshToken(refreshToken);

    res.cookie("refreshToken", result.refreshToken, refreshCookieOptions);

    return res.json({
      accessToken: result.accessToken,
    });
  } catch (error) {
    const tokenIsUnusable = [
    "INVALID_CREDENTIALS",
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