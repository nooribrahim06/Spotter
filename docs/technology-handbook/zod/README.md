# Zod

## What it is

Zod is a schema-validation library. A schema describes the shape and constraints of data, then parses unknown input into trusted output or reports structured validation issues.

In Spotter, Zod forms the boundary between untrusted HTTP JSON and the auth controller. It validates runtime values; JavaScript alone does not enforce types arriving over HTTP.

## How Spotter uses it

[`src/modules/auth/auth.validation.js`](../../../backend/src/modules/auth/auth.validation.js) defines the signup schema:

```js
export const signupSchema = z.object({
  email: z.string().email(),
  username: z.string().trim().min(3).max(30),
  password: z.string().min(8).max(72),
});
```

[`src/middlewares/validatebody.js`](../../../backend/src/middlewares/validatebody.js) is a reusable middleware factory:

```js
export function validateBody(schema) {
  return function (req, res, next) {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        errors: result.error.flatten(),
      });
    }

    req.validatedBody = result.data;
    next();
  };
}
```

The service receives `req.validatedBody`, not the original `req.body`. That keeps transport validation outside the business-logic layer.

## Current field behavior

| Field | Rules | Transformation |
| --- | --- | --- |
| `email` | Must be a string in an accepted email format. | No schema transformation. The service later trims and lowercases it. |
| `username` | String, 3–30 characters after trimming. | `.trim()` changes the returned value. |
| `password` | String, 8–72 JavaScript characters. | None. |

By default, `z.object()` strips unknown keys from the parsed output. If the API should reject unknown properties instead, use a strict object policy.

## API currently used

- `z.object({...})` combines field schemas into an object schema.
- `z.string()` requires a string value.
- `.email()`, `.min()`, and `.max()` add refinements.
- `.trim()` transforms successful string input.
- `.safeParse(input)` returns a discriminated success/failure result instead of throwing.

## What it can do next

- Define schemas for login, verification, resend, profile, pagination, route parameters, and query strings.
- Normalize email in the schema with `.trim().toLowerCase()` so normalization is centralized.
- Add password rules with `.regex()`, `.refine()`, or `.superRefine()` where product requirements justify them.
- Compose reusable fields with `.pick()`, `.omit()`, `.partial()`, `.extend()`, and `.safeExtend()`.
- Generate friendly field-level errors with `z.flattenError()` or nested errors with `z.treeifyError()`.
- Validate environment configuration at startup.
- Infer TypeScript types from schemas if the backend adopts TypeScript more fully.

## Operational notes

- In Zod 4, `ZodError.prototype.flatten()` is deprecated. The current code works for now, but new code should prefer `z.flattenError(result.error)`.
- The password limit should be byte-aware because bcrypt considers at most 72 UTF-8 bytes, while JavaScript string length is not the same as UTF-8 byte length.
- Validation proves the request shape, not business facts. Uniqueness still belongs in the database.
- Do not return internal validation objects blindly if the public API later requires a stable, versioned error contract.

## Official references

- [Zod API](https://zod.dev/api)
- [Zod error formatting](https://zod.dev/error-formatting)
- [Zod 4 migration guide](https://zod.dev/v4/changelog)

