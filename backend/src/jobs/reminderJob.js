const cron = require('node-cron');

const { dispatchDue, offsets } = require('../services/reminderService');
const logger = require('../config/logger');

// Named, so every line this job writes can be filtered out of - or into - the
// request traffic it sits alongside.
const log = logger.child({ job: 'reminders' });

// Often enough that a reminder goes out close to its offset, rarely enough that
// the scan is cheap. The scan itself is safe to run at any interval: it only
// sends what has not been sent.
const schedule = () => process.env.REMINDER_CRON || '*/15 * * * *';

let task;
let running = false;

const runOnce = async () => {
  // A slow pass must not overlap the next tick and scan the same appointments
  // twice; the duplicate guard would catch it, but there is no reason to.
  if (running) return null;
  running = true;

  const startedAt = Date.now();

  try {
    const tally = await dispatchDue();

    // Every pass is recorded, not only the ones that sent something. A job that
    // runs and finds nothing looks identical to a job that never ran, and the
    // difference matters when somebody asks why a reminder did not arrive.
    log.info(
      { ...tally, durationMs: Date.now() - startedAt },
      `reminder scan: ${tally.sent} sent, ${tally.skipped} skipped, ${tally.failed} failed`
    );
    return tally;
  } catch (err) {
    // Caught rather than thrown: a failed scan must not take down the process
    // or stop the schedule, and the next tick tries again. That retry is why
    // this is a warning about one pass and not a fatal error.
    log.error(
      { err: { message: err.message, stack: err.stack }, durationMs: Date.now() - startedAt },
      'reminder scan failed, will retry on the next tick'
    );
    return null;
  } finally {
    running = false;
  }
};

const start = () => {
  const expression = schedule();

  if (process.env.REMINDERS_ENABLED === 'false') {
    log.warn('reminders are disabled by configuration');
    return null;
  }
  if (!cron.validate(expression)) {
    log.error({ expression }, 'reminders not started: not a valid cron expression');
    return null;
  }

  task = cron.schedule(expression, runOnce);
  log.info({ expression, offsets: offsets() }, 'reminder schedule started');
  return task;
};

const stop = () => {
  if (task) task.stop();
  task = null;
};

module.exports = { start, stop, runOnce, schedule };
