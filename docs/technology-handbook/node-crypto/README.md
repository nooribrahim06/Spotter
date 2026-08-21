# Node.js Crypto

## What it is

`node:crypto` is Node.js's built-in cryptography module. It is part of the runtime and does not need an npm installation.

Spotter uses two different cryptographic operations for email verification:

1. Cryptographically secure random-token generation.
2. SHA-256 hashing of that random token before database storage.

This is intentionally different from password hashing. Passwords are human-chosen and require a deliberately slow password-hashing algorithm such as bcrypt. A 256-bit random token already has high entropy, so a fast cryptographic hash is appropriate for its stored verifier.

## How Spotter uses it

[`src/modules/auth/auth.service.js`](../../../backend/src/modules/auth/auth.service.js) generates the token sent to the user:

```js
const rawToken = crypto.randomBytes(32).toString("hex");
```

`32` random bytes provide 256 bits of randomness. Hex encoding converts each byte to two characters, producing a 64-character link token.

The service stores only a SHA-256 digest:

```js
const hashedToken = crypto
  .createHash("sha256")
  .update(rawToken)
  .digest("hex");
```

It also calculates an expiry:

```js
const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
```

The raw token goes into the emailed URL; `hashedToken` and the expiry go to PostgreSQL.

## API currently used

| API | Purpose |
| --- | --- |
| `randomBytes(32)` | Generate unpredictable bytes from a cryptographically secure source. |
| `Buffer.toString("hex")` | Convert bytes to a URL-compatible hexadecimal string. |
| `createHash("sha256")` | Create a streaming SHA-256 hash object. |
| `.update(value).digest("hex")` | Hash the token and encode the digest as hex. |

## What it can do next

- Hash a token received by the verification endpoint and query for the stored digest.
- Use `timingSafeEqual()` when directly comparing equal-length secret buffers in application code.
- Generate password-reset, email-change, invitation, API, and session secrets.
- Use HMACs to authenticate signed application messages.
- Generate asymmetric key pairs for supported signing or encryption workflows.
- Use Web Crypto APIs through `crypto.webcrypto` when standards-compatible browser/server code is valuable.

## Security and operational notes

- Never store the raw verification token. A database leak should not immediately produce usable verification links.
- Treat tokens as single-use: after successful verification, clear the digest and expiry.
- Check expiry before accepting a token.
- Avoid placing secret tokens in application logs, analytics events, or third-party error reports.
- Build the verification URL from configuration rather than a hard-coded localhost origin.
- SHA-256 is appropriate here because the input is random. It is not a replacement for bcrypt when hashing passwords.

## Official references

- [Node.js Crypto documentation](https://nodejs.org/api/crypto.html)
- [`crypto.randomBytes()`](https://nodejs.org/api/crypto.html#cryptorandombytessize-callback)
- [`crypto.createHash()`](https://nodejs.org/api/crypto.html#cryptocreatehashalgorithm-options)
- [`crypto.timingSafeEqual()`](https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b)

