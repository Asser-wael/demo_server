// Wraps an async Express handler so any thrown/rejected error is passed
// to next(err) automatically, instead of every controller needing its
// own try/catch just to forward errors to the centralized errorHandler
// middleware. Only use this for handlers whose catch block would do
// nothing beyond "return an error response" — a handler that needs to
// clean something up on failure (e.g. checkout()'s stock rollback)
// should keep its own try/catch.
const errorCatch = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default errorCatch;
