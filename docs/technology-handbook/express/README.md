# Express

## What it is

Express is the HTTP application framework for Spotter's backend. It organizes endpoints as ordered middleware pipelines and provides request, response, router, JSON parsing, and error-forwarding APIs.

An Express middleware can inspect or change `req` and `res`, terminate the response, or call `next()` to hand the request to the next middleware. Order is therefore part of the application's behavior.

## How Spotter uses it

[`src/app.js`](../../../backend/src/app.js) creates the application and mounts the auth router:

```js
export const app = express();
app.use("/api/auth", authRoutes);
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

## API currently used

| API | Spotter purpose |
| --- | --- |
| `express()` | Create the application. |
| `express.Router()` | Create the auth module's router. |
| `app.use(path, router)` | Mount auth routes under `/api/auth`. |
| `router.post(path, ...handlers)` | Register the signup request pipeline. |
| `express.json()` | Parse JSON and populate `req.body`. |
| `res.status(code).json(value)` | Return structured HTTP responses. |
| `next()` | Continue middleware processing. |
| `next(error)` | Skip normal middleware and enter error handling. |
| `app.listen(port, callback)` | Start accepting connections. |

## Error behavior today

The controller catches service errors and calls `next(error)`. There is currently no custom four-argument error middleware after the routes in `app.js`, so Express's built-in error handler is the final handler. It respects `error.statusCode`, but its response is not the consistent JSON error contract an API normally wants.

## What it can do next

- Add a final JSON error middleware with the signature `(error, req, res, next)`.
- Add a 404 handler after all routers.
- Move `express.json()` to application scope if most future routes consume JSON.
- Add authentication middleware once login and protected endpoints exist.
- Add CORS, security headers, request logging, compression, and request IDs.
- Split additional domains into their own routers, controllers, services, and repositories.
- Use Express 5's rejected-Promise forwarding to simplify some explicit controller `try/catch` blocks.

## Operational notes

- Middleware order is security-sensitive. The current limiter runs before body parsing, so blocked callers do not consume JSON-parsing work.
- A middleware that neither sends a response nor calls `next()` leaves the request hanging.
- Error middleware must have four parameters and must be registered after routes.
- Set `NODE_ENV=production` in production so the default handler does not expose development stack traces. A custom JSON handler is still preferable.

## Official references

- [Using Express middleware](https://expressjs.com/en/guide/using-middleware.html)
- [Express routing](https://expressjs.com/en/guide/routing.html)
- [Express 5 error handling](https://expressjs.com/en/5x/guide/error-handling.html)
- [Writing Express middleware](https://expressjs.com/en/5x/guide/writing-middleware.html)

