# cors

## What it is

cors is an Express middleware that implements the Cross-Origin Resource Sharing protocol (CORS). Browsers block JavaScript running on one origin from making requests to a different origin unless the server explicitly allows it through specific HTTP headers. The cors package handles this negotiation — both the preflight `OPTIONS` request and the headers on actual requests.

Spotter's backend runs on a different origin than the frontend (e.g., `localhost:5050` vs `localhost:5173`). Without CORS headers, the browser would silently block every fetch the frontend makes to the API.

## Why Spotter chose it

| Requirement | How cors satisfies it |
| --- | --- |
| Allow the frontend to call the API | The frontend and API run on different ports (and potentially different domains in production). CORS is required for cross-origin `fetch()` calls. |
| Credential support | Refresh tokens are sent as `httpOnly` cookies. The browser only sends cookies cross-origin when `Access-Control-Allow-Credentials: true` is set, which cors provides via `credentials: true`. |
| Origin whitelist | Only the configured `FRONTEND_URL` should be allowed. cors supports a dynamic `origin` function for this. |
| Method and header control | Spotter restricts allowed methods and headers to exactly what the API needs. |

## How Spotter uses it

### Configuration in app.js

[`src/app.js`](../../../backend/src/app.js) registers cors as the first middleware:

```js
import cors from "cors";

app.use(cors({
  origin(requestOrigin, callback) {
    if (!requestOrigin || requestOrigin === env.FRONTEND_URL) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
```

### Origin policy

The `origin` function implements a strict whitelist:

- **No origin** (`!requestOrigin`) → allowed. This covers server-to-server requests, cURL, Postman, and the test suite, which do not send an `Origin` header.
- **Matches `FRONTEND_URL`** → allowed. The environment variable is validated by Zod on startup (must be a valid URL, and must use HTTPS in production).
- **Anything else** → rejected. The browser receives no `Access-Control-Allow-Origin` header, so it blocks the response.

### Credentials

`credentials: true` tells cors to set `Access-Control-Allow-Credentials: true`. This is **required** because:
1. The frontend uses `fetch(url, { credentials: "include" })` so the browser sends the `refreshToken` cookie.
2. Without this header, the browser strips cookies from cross-origin requests.

### Contract tests

The test suite verifies CORS behavior directly:

```js
// Configured frontend → allowed
test("CORS allows the configured frontend and credentials", ...);
// Unknown origin → blocked
test("CORS does not authorize an unconfigured origin", ...);
```

## API currently used

| API / Option | Spotter purpose |
| --- | --- |
| `cors(options)` | Returns the middleware; registered with `app.use()`. |
| `origin(requestOrigin, callback)` | Dynamic function that whitelists only `FRONTEND_URL`. |
| `credentials: true` | Enables cookie-based authentication across origins. |
| `methods` | Restricts allowed HTTP methods to those the API actually implements. |
| `allowedHeaders` | Restricts allowed request headers to `Content-Type` and `Authorization`. |

## What it can do next

- **Multiple origins** — If Spotter adds an admin dashboard or mobile web app on a different domain, the `origin` function can check against an array of allowed origins.
- **`maxAge`** — Set `Access-Control-Max-Age` to cache preflight responses for a period (e.g., 600 seconds), reducing the number of `OPTIONS` requests the browser makes.
- **`exposedHeaders`** — Expose custom response headers (e.g., `X-Request-Id`, `RateLimit-*`) so the frontend JavaScript can read them. Currently, the rate-limit standard headers are set but may not be readable from the frontend.
- **Per-route CORS** — Apply cors middleware to specific routes only, if some endpoints need different policies (e.g., a public webhook endpoint that allows any origin).

## Operational notes

- cors must be registered **before** routes and **before** `cookieParser()` is strictly not required, but the current order (cors → cookieParser → routes) is idiomatic and correct.
- When `credentials: true`, the spec forbids `Access-Control-Allow-Origin: *`. The cors middleware handles this correctly — it echoes back the specific allowed origin instead.
- In production, `FRONTEND_URL` should use HTTPS. The Zod environment schema enforces this with a `superRefine` check.
- The preflight `OPTIONS` request is handled automatically by the cors middleware. Express 5 does not require a separate `app.options("*", cors())` call because `app.use(cors())` already covers it.

## Official references

- [cors GitHub repository](https://github.com/expressjs/cors)
- [MDN — Cross-Origin Resource Sharing](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [Fetch specification — CORS protocol](https://fetch.spec.whatwg.org/#http-cors-protocol)
