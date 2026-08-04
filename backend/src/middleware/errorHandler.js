const logger = require('../config/logger');

// Anything that reaches here was not anticipated by a controller. The message
// on such an error is written for a developer and routinely names tables,
// columns, files or query text, so a deployment sends a fixed sentence instead
// and keeps the detail in the log where it belongs.
//
// Errors a controller means the caller to read are sent by that controller with
// its own status and wording; they never come through here.
module.exports = (err, req, res, next) => {
  const status = err.status || 500;

  // Logged in full either way: hiding it from the caller is not the same as
  // hiding it from whoever has to fix it. Logged against the request's own id,
  // so the trace, the request line and the account are one searchable group
  // rather than three things to line up by timestamp.
  const log = req.log || logger;

  log.error(
    {
      err: {
        message: err.message,
        stack: err.stack,
        // Database drivers and validators carry their own codes, and they are
        // usually the fastest route to what actually went wrong.
        name: err.name,
        code: err.code,
      },
      method: req.method,
      path: req.originalUrl,
      status,
      userId: req.user?.id,
      role: req.user?.role,
    },
    `unhandled error: ${err.message}`
  );

  const revealing = process.env.NODE_ENV !== 'production';

  res.status(status).json({
    message: revealing ? err.message || 'Internal server error' : 'Something went wrong',
    // Returned in every environment, and deliberately.
    //
    // It reveals nothing - it is a random id assigned to this request - and it
    // is what turns "the site broke" into a report somebody can act on. The
    // frontend shows it on the error screen for the user to quote.
    requestId: req.id,
    ...(revealing && err.stack ? { stack: err.stack } : {}),
  });
};
