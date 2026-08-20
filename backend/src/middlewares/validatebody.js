


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