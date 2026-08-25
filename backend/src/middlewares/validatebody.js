import { invalidSchemaError } from "./errorHandling.js";


export function validateBody(schema) {
  return function (req, res, next) {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      // Only expose public field paths and validation messages. Submitted
      // values, schema internals, stack traces, and database details stay private.
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));

      throw new invalidSchemaError(details);
    }

    req.validatedBody = result.data;
    next();
  };
}
