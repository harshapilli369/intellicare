// Anything that reaches here was not anticipated by a controller. The message
// on such an error is written for a developer and routinely names tables,
// columns, files or query text, so a deployment sends a fixed sentence instead
// and keeps the detail in the server log where it belongs.
//
// Errors a controller means the caller to read are sent by that controller with
// its own status and wording; they never come through here.
module.exports = (err, req, res, next) => {
  const status = err.status || 500;

  // Logged in full either way: hiding it from the caller is not the same as
  // hiding it from whoever has to fix it.
  console.error(`${req.method} ${req.originalUrl} -> ${status}`, err);

  const revealing = process.env.NODE_ENV !== 'production';

  res.status(status).json({
    message: revealing ? err.message || 'Internal server error' : 'Something went wrong',
    ...(revealing && err.stack ? { stack: err.stack } : {}),
  });
};
