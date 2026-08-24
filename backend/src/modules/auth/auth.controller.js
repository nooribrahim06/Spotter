import * as authService from "./auth.service.js";
import { env } from "../../config/env.js";
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
    

        res.cookie("refreshToken", result.refreshToken, {
            httpOnly: true,
            secure: env.NODE_ENV === "production",
            sameSite: "lax", // this is sameSite policy, making it true means the cookie will only be sent in a first-party context and not be sent along with requests initiated by third party websites
            // we can say its lax because we want to allow the cookie to be sent in top-level navigation GET requests, but not in other cross-site requests.
            // we try to avoid CSRF attacks, but we still want to allow the cookie to be sent in top-level navigation GET requests, because that is a common use case for our app.
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

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
  const refreshCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

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
    res.clearCookie("refreshToken", refreshCookieOptions);
  }

  return next(error);
  }
}