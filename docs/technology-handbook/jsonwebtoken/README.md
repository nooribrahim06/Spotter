# jsonwebtoken

## What it is

jsonwebtoken is a Node.js library that implements the JSON Web Token (RFC 7519) standard. It signs a JSON payload with a secret or key pair, producing a compact URL-safe string that any holder can verify without a database lookup. Spotter uses it exclusively for **short-lived access tokens** — the stateless credential a client attaches to every authenticated API request.

Refresh tokens are intentionally **not** JWTs. They are opaque random secrets whose SHA-256 hashes are stored in the database, giving the server full control over revocation.

## Why Spotter chose it

| Requirement | How jsonwebtoken satisfies it |
| --- | --- |
| Stateless API auth | Middleware can verify a token's signature and expiry from memory alone — no database round-trip per request. |
| Short-lived credentials | The `expiresIn` option sets a built-in expiry claim (`exp`), so stolen tokens expire automatically. |
| Custom claims | Spotter embeds `typ`, `sid` (session ID), `sub` (user ID), `jti` (token ID), `iss`, and `aud` directly in the payload. |
| Ecosystem maturity | jsonwebtoken is the most downloaded JWT library on npm and is well understood, making it easy to audit. |

## How Spotter uses it

All JWT logic is centralized in [`src/modules/auth/auth.tokens.js`](../../../backend/src/modules/auth/auth.tokens.js).

### Signing an access token

```js
import jwt from "jsonwebtoken";

jwt.sign(
  { typ: "access", sid: sessionId },
  env.ACCESS_TOKEN_SECRET,
  {
    algorithm: "HS256",
    subject: userId,
    jwtid: randomUUID(),
    issuer: "spotter-api",
    audience: "spotter-api",
    expiresIn: env.ACCESS_TOKEN_EXPIRATION,   // default "15m"
  }
);
```

The secret is loaded from the `ACCESS_TOKEN_SECRET` environment variable and validated by Zod on startup to be at least 32 bytes of base64url.

### Verifying an access token

```js
const decoded = jwt.verify(token, env.ACCESS_TOKEN_SECRET, {
  algorithms: ["HS256"],
  issuer: "spotter-api",
  audience: "spotter-api",
});
```

After `jwt.verify` passes (signature valid, not expired, issuer/audience match), the code performs additional application-level checks: `typ === "access"`, `sub`, `sid`, and `jti` must all be non-empty strings, and `exp > iat`.

### Where it runs in the request flow

```text
Client → Authorization: Bearer <JWT>
  → auth.middleware.js → verifyAccessToken()
    → jwt.verify() ✓
    → application claim checks ✓
    → database lookups (user exists, session valid)
  → protected route handler
```

Login and refresh flows call `createAccessToken()` in the auth service and return the JWT in the response body. The client stores it in memory (not a cookie) and attaches it as a Bearer header.

## API currently used

| API | Spotter purpose |
| --- | --- |
| `jwt.sign(payload, secret, options)` | Create a signed access token after login or refresh. |
| `jwt.verify(token, secret, options)` | Verify a token's signature, expiry, issuer, and audience in the auth middleware. |
| `jwt.JsonWebTokenError` | Thrown (via constructor) when application-level claim checks fail after successful cryptographic verification. |
| `options.algorithm` | Locked to `"HS256"` on both sign and verify to prevent algorithm-switching attacks. |
| `options.expiresIn` | Sets the `exp` claim. Configured through `ACCESS_TOKEN_EXPIRATION` env var. |
| `options.subject` | Maps to the `sub` claim — carries the user ID. |
| `options.jwtid` | Maps to the `jti` claim — a `randomUUID()` per token for uniqueness. |
| `options.issuer` / `options.audience` | Both set to `"spotter-api"` — verified on decode to reject tokens from other systems. |

## What it can do next

- **Asymmetric keys (RS256 / ES256)** — Allow token verification without sharing the signing secret, useful if Spotter ever has separate microservices that only need to verify, not create, tokens.
- **`options.clockTolerance`** — Accept tokens up to a few seconds past expiry to absorb clock skew between servers.
- **Token blacklisting** — Use the `jti` claim to maintain a short-lived deny list (e.g., in Redis) for immediate access-token revocation during security incidents.
- **`options.notBefore`** — Issue tokens that only become valid after a delay.
- **Audience arrays** — If Spotter adds an admin panel or mobile API with different trust levels, `aud` can be an array scoping tokens to specific consumers.

## Operational notes

- The HMAC secret **must** stay private. If it leaks, any party can forge valid access tokens. Rotate the secret and force a global re-login if compromise is suspected.
- `HS256` requires the same secret for signing and verification. This is appropriate while Spotter is a single-service backend; switch to asymmetric if the architecture splits.
- Short expiry (15 minutes) limits the damage window of a stolen access token. Combined with refresh-token rotation and the theft trigger, Spotter's token lifecycle follows OWASP best practices.
- Always pin `algorithms: ["HS256"]` in `verify()` to prevent the "none" algorithm attack.
- `jwt.verify` is synchronous — it blocks the event loop briefly, but HS256 verification is fast enough for per-request use at Spotter's current scale.

## Official references

- [jsonwebtoken GitHub repository](https://github.com/auth0/node-jsonwebtoken)
- [RFC 7519 — JSON Web Token](https://datatracker.ietf.org/doc/html/rfc7519)
- [OWASP JWT cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)
