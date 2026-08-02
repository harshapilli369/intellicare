const pino = require('pino');

// Structured logs, because a log is only useful if it can be searched.
//
// This replaced `morgan('dev')`, which writes a coloured line per request and
// nothing at all about an error's context. That is readable over a developer's
// shoulder and close to useless afterwards: it cannot be filtered by user, by
// status, or by which request a stack trace belongs to, and on a hosted service
// it is one undifferentiated stream.
//
// Every line here is JSON with the same shape, so `level`, `status`,
// `requestId` and `userId` can all be searched on.

// Nothing in this list is ever written down, wherever it appears in an object.
// A password, a token or a health card number in a log file is a breach that
// outlives the request that caused it - and logs get copied to places the
// database never goes.
const REDACTED = [
  'req.headers.authorization',
  'req.headers.cookie',
  'password',
  'passwordHash',
  'token',
  'newPassword',
  'healthCardNumber',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.healthCardNumber',
];

const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),

  redact: { paths: REDACTED, censor: '[redacted]' },

  // ISO timestamps rather than epoch milliseconds: these are read by people as
  // often as by machines, and correlating with a bug report means matching a
  // wall clock.
  timestamp: pino.stdTimeFunctions.isoTime,

  formatters: {
    // `level: "error"` rather than `level: 30`, so a log search does not need a
    // lookup table to be useful.
    level: (label) => ({ level: label }),
  },

  base: { service: 'intellicare-api' },
});

module.exports = logger;
