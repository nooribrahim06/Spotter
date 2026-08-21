# bcryptjs

## What it is

`bcryptjs` is a pure-JavaScript implementation of the bcrypt password-hashing algorithm. Bcrypt combines a random salt with a configurable work factor, producing hashes that are intentionally expensive to calculate. This slows offline password guessing if stored hashes are stolen.

Hashing is one-way. A login flow does not decrypt a stored password; it hashes the submitted password using parameters embedded in the stored hash and compares the result.

## How Spotter uses it

[`src/modules/auth/auth.service.js`](../../../backend/src/modules/auth/auth.service.js) imports `bcryptjs` and hashes a validated password before database insertion:

```js
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;
const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
```

The plaintext password is not passed to the repository and is not stored in PostgreSQL. [`schema.prisma`](../../../backend/prisma/schema.prisma) stores the result in `passwordHash`, mapped to the `password_hash` column.

Passing a number to `bcrypt.hash()` tells the library to generate a salt using that cost factor and include the salt and cost metadata in the final hash.

## API currently used

| API | Purpose |
| --- | --- |
| `bcrypt.hash(password, 12)` | Asynchronously generate a salted bcrypt hash using cost 12. |

The installed `bcrypt` native package is not used by the current source. Spotter imports `bcryptjs`; these are separate packages with compatible-looking APIs.

## What it can do next

- Verify login passwords with `await bcrypt.compare(candidate, storedHash)`.
- Read a stored hash's cost with `bcrypt.getRounds(hash)`.
- Rehash a password after a successful login when the stored cost is below the current policy.
- Reject inputs that bcrypt would truncate by checking `bcrypt.truncates(password)`.
- Benchmark the selected rounds on production-like hardware and adjust the cost over time.

## Security and operational notes

- `bcryptjs` is currently listed under `devDependencies`, but the auth service requires it at runtime. A production install using `npm install --omit=dev` would omit it and fail to start. Move it to `dependencies` when dependency cleanup is approved.
- Bcrypt processes at most 72 **bytes** of password input. UTF-8 characters may occupy more than one byte. Spotter's Zod `.max(72)` checks JavaScript characters, so it does not guarantee a 72-byte maximum.
- `bcryptjs` is pure JavaScript and its maintainers report that it is slower than the native C++ binding. That portability is useful, but the work factor should be measured rather than assumed.
- Use the asynchronous APIs in request handlers. Synchronous hashing blocks the event loop.
- Never log plaintext passwords or hashes.
- Rate-limit login separately. Password hashing is deliberately expensive and can be abused for resource exhaustion.
- Keep only one of `bcryptjs` and `bcrypt` unless the project has an explicit reason for both.

## Official references

- [bcrypt.js repository and API](https://github.com/dcodeIO/bcrypt.js/)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
