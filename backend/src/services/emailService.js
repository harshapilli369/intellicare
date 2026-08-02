const nodemailer = require('nodemailer');

let transport;

const smtpConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);

// Built once, and only when there is something to build it from. Without SMTP
// settings the service still works - it reports mail as skipped rather than
// throwing - so a developer without mail credentials can run the whole app.
// Somewhere between "slow" and "never": many hosts block outbound SMTP
// silently, so the connection does not refuse, it hangs. Nodemailer's own
// defaults are minutes long, which turns a blocked port into a request that
// appears to have died. Ten seconds is far longer than a reachable server
// needs and short enough that the caller still gets an answer.
const TIMEOUT_MS = Number(process.env.SMTP_TIMEOUT_MS) || 10000;

const getTransport = () => {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      socketTimeout: TIMEOUT_MS,
    });
  }
  return transport;
};

// Returns what happened rather than throwing, so a caller sending in bulk can
// record the outcome per recipient and carry on.
const sendMail = async ({ to, subject, text }) => {
  if (!to) return { status: 'skipped', detail: 'no address on file' };

  if (!smtpConfigured()) {
    console.log(`[email skipped: SMTP not configured] to=${to} subject="${subject}"`);
    return { status: 'skipped', detail: 'SMTP not configured' };
  }

  try {
    await getTransport().sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
    });
    return { status: 'sent', detail: null };
  } catch (err) {
    console.error(`Email to ${to} failed: ${err.message}`);
    return { status: 'failed', detail: err.message };
  }
};

module.exports = { sendMail, smtpConfigured };
