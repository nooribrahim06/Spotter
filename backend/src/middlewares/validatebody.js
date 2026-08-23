import { invalidSchemaError } from "./errorHandling.js";


export function validateBody(schema) {
  return function (req, res, next) {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      // If validation fails, throw an error with readable messages

        const errorMessages = result.error.issues.map((issue) => issue.message).join(", ");

      throw new invalidSchemaError(errorMessages);
    }

    req.validatedBody = result.data;
    next();
  };
}