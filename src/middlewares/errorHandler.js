// Centralized error-handling middleware — the single place responses are
// shaped for any error that reaches here (either thrown asynchronously
// and caught by errorCatch, or passed to next(err) directly). Keeping
// this one function in charge of response shape/logging is deliberately
// the only large "console" logging left standing after the rest of the
// codebase's ad-hoc console.log calls were removed.
const errorHandler = (err, req, res, next) => {
  console.error(err.stack || err.message);

  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err.message || "Something went wrong";

  // Translate a few common Mongoose/JWT error shapes into safe, friendly
  // messages instead of leaking schema/field internals to the client.
  if (err.name === "CastError") {
    statusCode = 400;
    message = "Invalid ID format";
  } else if (err.name === "ValidationError") {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join(", ");
  } else if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0];
    message = field
      ? `This ${field} is already in use`
      : "Duplicate value";
  } else if (
    err.name === "JsonWebTokenError" ||
    err.name === "TokenExpiredError"
  ) {
    statusCode = 401;
    message = "Invalid or expired token";
  }

  res.status(statusCode).json({
    success: false,
    message,
    stack:
      process.env.NODE_ENV === "production"
        ? undefined
        : err.stack,
  });
};

export { errorHandler };