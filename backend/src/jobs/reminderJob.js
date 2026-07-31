const cron = require('node-cron');

const { dispatchDue, offsets } = require('../services/reminderService');

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

  try {
    const tally = await dispatchDue();
    if (tally.sent || tally.failed) {
      console.log(
        `Reminders: ${tally.sent} sent, ${tally.skipped} skipped, ${tally.failed} failed`
      );
    }
    return tally;
  } catch (err) {
    console.error(`Reminder scan failed: ${err.message}`);
    return null;
  } finally {
    running = false;
  }
};

const start = () => {
  const expression = schedule();

  if (process.env.REMINDERS_ENABLED === 'false') {
    console.log('Reminders disabled');
    return null;
  }
  if (!cron.validate(expression)) {
    console.error(`Reminders not started: "${expression}" is not a valid cron expression`);
    return null;
  }

  task = cron.schedule(expression, runOnce);
  console.log(`Reminders scheduled (${expression}), offsets ${offsets().join('h, ')}h`);
  return task;
};

const stop = () => {
  if (task) task.stop();
  task = null;
};

module.exports = { start, stop, runOnce, schedule };
