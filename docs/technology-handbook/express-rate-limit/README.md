# express-rate-limit

## What it is

`express-rate-limit` is Express middleware for limiting repeated requests from the same client identity during a configured time window. It is an abuse-control layer, not authentication and not a complete denial-of-service defense.

The package counts requests by a generated key. With the default configuration, that key is based on the client's IP address and counts are stored in process memory.

## How Spotter uses it

[`src/middlewares/rateLimiter.js`](../../../backend/src/middlewares/rateLimiter.js) creates one limiter specifically for signup:

```js
export const signupRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many signup attempts from this IP, please try again after 15 minutes",
  standardHeaders: true,
  legacyHeaders: false,
});
```

The limiter runs first in the signup route. It allows at most five requests per IP during a 15-minute window. When the limit is exceeded, it ends the request with HTTP `429 Too Many Requests`; body parsing, validation, password hashing, database insertion, and email sending do not run.

## Configuration currently used

| Option | Current value | Meaning |
| --- | --- | --- |
| `windowMs` | `900000` ms | Count attempts in a 15-minute window. |
| `max` | `5` | Backward-compatible name for the current `limit` option. |
| `message` | Plain string | Body returned by the default blocked-request handler. |
| `standardHeaders` | `true` | Emit standardized rate-limit information; currently interpreted as the draft-6 format. |
| `legacyHeaders` | `false` | Do not emit the older `X-RateLimit-*` headers. |
| `store` | Not specified | Use the built-in `MemoryStore`. |

## What it can do next

- Use `limit` instead of the older `max` alias for current terminology.
- Return a JSON error body through a custom `handler`.
- Use `standardHeaders: "draft-8"` for an explicit modern header format.
- Apply different policies to login, password reset, verification resend, and general APIs.
- Use a custom `keyGenerator` when a verified account ID is more appropriate than an IP.
- Add a shared Redis or PostgreSQL-backed store for multiple Node.js processes or servers.
- Combine hard limits with `express-slow-down` when gradually delaying abusive callers is useful.

## Operational notes

- `express-rate-limit` is currently listed under `devDependencies`, but application source imports it at runtime. A production install using `npm install --omit=dev` would omit it and fail to start. Move it to `dependencies` when dependency cleanup is approved.
- `MemoryStore` resets when the process restarts and does not synchronize across server instances. It is adequate for basic local protection but not strict distributed enforcement.
- When deployed behind a reverse proxy, configure Express's `trust proxy` correctly. Otherwise `req.ip` may represent the proxy or may be spoofable, depending on the infrastructure.
- Many users can legitimately share one public IP. Very low IP limits may block schools, gyms, offices, or mobile-carrier users together.
- Rate limiting does not replace email verification, password policy, bot detection, audit logging, or upstream network protection.
- The response message is currently plain text because the default handler uses `res.send(message)`. Use a custom handler if the frontend expects JSON everywhere.

## Official references

- [express-rate-limit overview](https://express-rate-limit.mintlify.app/overview)
- [Configuration reference](https://express-rate-limit.mintlify.app/reference/configuration)
- [Usage guide](https://express-rate-limit.mintlify.app/quickstart/usage)
- [Supported stores](https://express-rate-limit.mintlify.app/reference/stores)
