const crypto = require('crypto');

const logger = require('../config/logger');

// One line per request, and an id that ties everything about it together.
//
// The id is the point. Without it, a stack trace in a log and a user saying
// "it broke around three o'clock" are two separate problems. With it, the id is
// returned in a response header and shown on the error screen, so a person can
// read it out and it leads straight to the request that failed, the account
// that made it, and the trace.
//
// An id supplied by the caller is honoured when it looks reasonable, so that a
// request traced through a proxy or another service keeps one identity - but it
// is bounded and stripped first, since it ends up in a response header and in
// every log line about this request.
const CALLER_ID = /^[\w-]{1,64}$/;

const requestLogger = (req, res, next) => {
  const supplied = req.get('X-Request-Id');
  req.id = CALLER_ID.test(supplied || '') ? supplied : crypto.randomUUID();

  res.set('X-Request-Id', req.id);

  // A child logger, so anything logged during this request carries its id
  // without every call site having to remember to attach it.
  req.log = logger.child({ requestId: req.id });

  const startedAt = process.hrtime.bigint();

  // On `finish` rather than up front: the interesting parts of a request - what
  // it answered and how long it took - are only known once it is over.
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

    // A 500 is the application's fault and deserves attention; a 401 or a 404
    // is usually the world working correctly and should not cry wolf. Logging
    // everything at one level makes the level worthless for filtering.
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    req.log[level](
      {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Number(durationMs.toFixed(1)),
        // Who it was, when it was anybody. Never the token itself.
        userId: req.user?.id,
        role: req.user?.role,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        bytes: Number(res.get('Content-Length')) || undefined,
      },
      `${req.method} ${req.originalUrl} ${res.statusCode}`
    );
  });

  next();
};

module.exports = requestLogger;
