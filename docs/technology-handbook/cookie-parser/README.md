# cookie-parser

## What it is

cookie-parser is an Express middleware that reads the `Cookie` HTTP header from every incoming request, decodes it, and populates `req.cookies` (and optionally `req.signedCookies`) with a plain JavaScript object. Without it, Express does not parse cookies at all.

Spotter uses cookie-parser to extract the **refresh token** that the client's browser sends automatically on every request to the auth endpoints.

## Why Spotter chose it

| Requirement | How cookie-parser satisfies it |
| --- | --- |
| Read refresh tokens from cookies | After login, the refresh token is set as an `httpOnly` cookie. The server must be able to read it back on `/refresh`, `/logout`, and `/logout-all`. |
| `httpOnly` security model | Refresh tokens must not be accessible to client-side JavaScript. Cookies with `httpOnly` are only sent by the browser, and cookie-parser reads them server-side. |
| Simple, focused middleware | cookie-parser does one thing (parse cookies), does it reliably, and adds no overhead for routes that do not need cookies. |
| Express ecosystem standard | It is the de facto cookie-parsing library for Express, with minimal dependencies and stable API. |

## How Spotter uses it

### Registration as global middleware

[`src/app.js`](../../../backend/src/app.js) registers cookie-parser at the application level, before any routes:

```js
import cookieParser from "cookie-parser";

app.use(cookieParser());
```

This ensures `req.cookies` is populated for every request.

### Reading the refresh token

The auth controller reads the refresh token cookie in multiple places:

```js
// src/modules/auth/auth.controller.js
const refreshToken = req.cookies?.refreshToken;
```

This is used in:
- **`refreshController`** — reads the cookie and passes it to the service for token rotation.
- **`logoutController`** — reads the cookie to revoke the current session.
- **`logoutAllController`** — reads the cookie to revoke all sessions for the user.

### Setting and clearing the cookie

While cookie-parser only *reads* cookies, the corresponding *write* side uses Express's built-in `res.cookie()` and `res.clearCookie()`:

```js
// Setting after login or refresh
res.cookie("refreshToken", result.refreshToken, {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: env.NODE_ENV === "production" ? "none" : "lax",
  partitioned: env.NODE_ENV === "production",
  path: "/",
  maxAge: env.REFRESH_TOKEN_EXPIRATION * 24 * 60 * 60 * 1000,
});

// Clearing on logout
res.clearCookie("refreshToken", {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: env.NODE_ENV === "production" ? "none" : "lax",
  partitioned: env.NODE_ENV === "production",
  path: "/",
});
```

### Request flow

```text
Browser sends Cookie: refreshToken=<opaque-base64url>
  → cookieParser() populates req.cookies.refreshToken
  → Controller reads req.cookies.refreshToken
  → Service hashes it and looks it up in the database
```

## API currently used

| API | Spotter purpose |
| --- | --- |
| `cookieParser()` | Returns a middleware function; registered with `app.use()`. |
| `req.cookies` | Plain object containing parsed cookie name-value pairs. Spotter reads `req.cookies.refreshToken`. |

## What it can do next

- **Signed cookies** — Pass a secret to `cookieParser(secret)` and use `req.signedCookies` to detect tampered cookies. Spotter currently relies on SHA-256 hashing and database lookup for integrity, so this is not strictly needed, but it adds a defense-in-depth layer.
- **Cookie prefixes** — Rename the cookie to `__Host-refreshToken` in production for additional browser-enforced security (requires `Secure`, `Path=/`, and no `Domain`).
- **JSON cookies** — cookie-parser can auto-decode JSON values stored in cookies (prefixed with `j:`), which could be useful if Spotter needs to store structured data in cookies later.

## Operational notes

- cookie-parser must be registered **before** any route handler that reads `req.cookies`. The current placement in `app.js` (right after CORS) is correct.
- When clearing a cookie, the `path`, `httpOnly`, `secure`, and `sameSite` options **must match** those used when setting it, or the browser will not remove it. Spotter centralizes these options in `refreshCookieBaseOptions` to prevent mismatches.
- cookie-parser does **not** set cookies — it only reads them. Setting is done through Express's built-in `res.cookie()`.
- There is no performance concern: cookie parsing is a simple string split and URI-decode, with negligible cost per request.

## Official references

- [cookie-parser GitHub repository](https://github.com/expressjs/cookie-parser)
- [Express `res.cookie()` documentation](https://expressjs.com/en/5x/api.html#res.cookie)
- [MDN — HTTP cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies)
