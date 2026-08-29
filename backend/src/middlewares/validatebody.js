import { invalidSchemaError } from "./errorHandling.js";


// this helper is shared by auth and onboarding. it intentionally returns only
// field + message, never the rejected value, schema internals, or stack trace.
export function createPublicErrorDetails(error) {
  return error.issues.flatMap((issue) => {
    if (
      issue.code === "unrecognized_keys" &&
      Array.isArray(issue.keys)
    ) {
      return issue.keys.map((field) => ({
        field,
        message: "This field is not allowed.",
      }));
    }

    return [
      {
        field: issue.path.join(".") || "data",
        message: issue.message,
      },
    ];
  });
}


export function validateBody(schema) {
  return function (req, res, next) {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      throw new invalidSchemaError(
        createPublicErrorDetails(result.error)
      );
    }

    req.validatedBody = result.data;
    next();
  };
}
