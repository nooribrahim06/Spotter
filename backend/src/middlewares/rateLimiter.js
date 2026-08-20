import rateLimit from "express-rate-limit";



// signup rate limiter middleware
//1. Read the user’s IP address.
//2. Count recent signup attempts from that IP.
//3. Stop abusive requests.
//4. It does not need the request body.
export const signupRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 signup requests per `window` (here, per 15 minutes)
    message: "Too many signup attempts from this IP, please try again after 15 minutes",
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    // so the front end can read the headers and show the user how long they have to wait before trying again.
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    // and this is because the legacy headers are not standard and are being deprecated in favor of the standard headers.
});
