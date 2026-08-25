import rateLimit from "express-rate-limit";

export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
  message: {
    error: "Too many requests. Please try again later.",
    code: "TOO_MANY_REQUESTS",},
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// signup rate limiter middleware
//1. Read the user’s IP address.
//2. Count recent signup attempts from that IP.
//3. Stop abusive requests.
//4. It does not need the request body.
export const signupRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 signup requests per `window` (here, per 15 minutes)
    message: {
  error: "Too many attempts. Please try again later.",
  code: "TOO_MANY_REQUESTS",
},
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    // so the front end can read the headers and show the user how long they have to wait before trying again.
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    // and this is because the legacy headers are not standard and are being deprecated in favor of the standard headers.
});
export const verifyEmailRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: {
    error: "Too many verification attempts. Please try again later.",
    code: "TOO_MANY_REQUESTS",
  },
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

export const resendVerificationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    error: "Too many resend attempts. Please try again later.",
    code: "TOO_MANY_REQUESTS",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 login requests per `window` (here, per 15 minutes)
    message: {
    error: "Too many login attempts. Please try again later.",
    code: "TOO_MANY_REQUESTS",
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
