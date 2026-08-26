# Express

## What it is

Express is the HTTP application framework for Spotter's backend. It organizes endpoints as ordered middleware pipelines and provides request, response, router, JSON parsing, and error-forwarding APIs.

An Express middleware can inspect or change `req` and `res`, terminate the response, or call `next()` to hand the request to the next middleware. Order is therefore part of the application's behavior.

## How Spotter uses it

[`src/app.js`](../../../backend/src/app.js) creates the application, registers global middleware, mounts the auth router, and defines the global error handler:

```js
export const app = express();

app.use(cors({ ... }));        // CORS — allow the frontend origin with credentials
app.use(cookieParser());        // Parse cookies (refresh tokens)
app.use("/api/auth", authRoutes);
app.use((err, req, res, next) => { ... });  // Global JSON error handler
```

[`src/modules/auth/auth.routes.js`](../../../backend/src/modules/auth/auth.routes.js) creates a modular router and defines the signup pipeline:

```js
export const authRoutes = express.Router();

authRoutes.post(
  "/signup",
  signupRateLimiter,
  express.json(),
  validateBody(signupSchema),
  signupController,
);
```

Because the router is mounted at `/api/auth`, the public endpoint is:

```text
POST /api/auth/signup
```

The execution order is:

1. Limit repeated signup attempts.
2. Parse a JSON body.
3. Validate and transform the body.
4. Call the controller.
5. Send `201 Created`, or forward an error with `next(error)`.

[`src/index.js`](../../../backend/src/index.js) calls `app.listen()` to start the HTTP server. Keeping startup separate from `app.js` makes the application easier to import in tests.

The auth router now defines seven endpoints:

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/auth/signup` | POST | Create account, enqueue verification email |
| `/api/auth/verify-email` | POST | Verify email with hashed token |
| `/api/auth/resend-verification` | POST | Re-send verification email |
| `/api/auth/login` | POST | Authenticate, create session, issue tokens |
| `/api/auth/refresh` | POST | Rotate refresh token, issue new access token |
| `/api/auth/logout` | POST | Revoke current session |
| `/api/auth/logout-all` | POST | Revoke all user sessions |
| `/api/auth/protected` | GET | Test endpoint behind `authenticateToken` middleware |

## API currently used

| API | Spotter purpose |
| --- | --- |
| `express()` | Create the application. |
| `express.Router()` | Create the auth module's router. |
| `app.use(middleware)` | Register global middleware (cors, cookieParser, error handler). |
| `app.use(path, router)` | Mount auth routes under `/api/auth`. |
| `router.post(path, ...handlers)` | Register request pipelines for auth endpoints. |
| `router.get(path, ...handlers)` | Register the protected test endpoint. |
| `express.json()` | Parse JSON and populate `req.body` (per-route, not global). |
| `res.status(code).json(value)` | Return structured HTTP responses. |
| `res.json(value)` | Return JSON with the default 200 status. |
| `res.set(header, value)` | Set response headers (e.g., `Cache-Control: no-store` on login/refresh). |
| `res.cookie(name, value, options)` | Set the refresh token as an httpOnly cookie. |
| `res.clearCookie(name, options)` | Remove the refresh token cookie on logout. |
| `req.get(header)` | Read request headers (e.g., `Authorization` in auth middleware). |
| `req.cookies` | Parsed cookies (populated by cookie-parser). |
| `req.ip` | Client IP address for session metadata. |
| `req.headers` | Access raw request headers (e.g., `user-agent`). |
| `next()` | Continue middleware processing. |
| `next(error)` | Skip normal middleware and enter error handling. |
| `app.listen(port, host, callback)` | Start accepting connections on a specific host and port. |

## Error behavior today

`app.js` now has a custom four-argument error middleware registered after all routes. It handles:

- **Operational errors** (`err.isOperational === true`) — returns the error's `statusCode`, `code`, `message`, and optional `details`.
- **JSON parse failures** (`err.type === "entity.parse.failed"`) — returns `400 INVALID_JSON`.
- **Payload too large** (`err.type === "entity.too.large"`) — returns `413 ENTITY_TOO_LARGE`.
- **Unexpected errors** — returns `500 INTERNAL_SERVER_ERROR` with a generic message.
- **Headers already sent** — delegates to Express's default handler via `next(err)`.

All error responses follow a consistent JSON contract: `{ error, code }` with an optional `details` array. The error handler also suppresses console output during tests (`NODE_ENV === "test"`).

## What it can do next

- Add a 404 handler after all routers for unmatched routes.
- Move `express.json()` to application scope if most future routes consume JSON (currently it is per-route to avoid parsing bodies on routes that don't need them).
- Add security headers (e.g., `helmet`) for `X-Content-Type-Options`, `Strict-Transport-Security`, etc.
- Add request logging middleware (e.g., `morgan` or a custom logger) for observability.
- Add compression middleware for response bodies.
- Add request IDs (e.g., `X-Request-Id`) for tracing requests across logs.
- Split additional domains (users, workouts, etc.) into their own routers, controllers, services, and repositories.
- Take advantage of Express 5's automatic rejected-Promise forwarding — async route handlers that throw already propagate to the error handler without explicit `try/catch`.

## Operational notes

- **Middleware order is security-sensitive.** The current order is: cors → cookieParser → routes (each with their own rate limiter → json → validation → controller) → global error handler.
- Rate limiters run before body parsing, so blocked callers do not consume JSON-parsing work.
- A middleware that neither sends a response nor calls `next()` leaves the request hanging.
- The global error middleware has four parameters `(err, req, res, next)` and is registered after all routes — this is required by Express.
- Express 5 automatically forwards rejected promises from async middleware/handlers to the error handler, so many routes do not need explicit `try/catch`.
- The `Cache-Control: no-store` header is set on login and refresh responses to prevent browsers or proxies from caching tokens.

## Official references

- [Using Express middleware](https://expressjs.com/en/guide/using-middleware.html)
- [Express routing](https://expressjs.com/en/guide/routing.html)
- [Express 5 error handling](https://expressjs.com/en/5x/guide/error-handling.html)
- [Writing Express middleware](https://expressjs.com/en/5x/guide/writing-middleware.html)

