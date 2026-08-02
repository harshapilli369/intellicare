const nodemailer = require('nodemailer');

let transport;

// Two ways out, chosen by what is configured.
//
// SMTP is the obvious one and works fine from a developer machine. It does not
// work from the deployment: hosts commonly block outbound SMTP to stop their
// instances being used to send spam, and they block it by swallowing the
// connection rather than refusing it, so a send hangs until it times out. The
// symptom is "Connection timeout" and no amount of correcting credentials
// changes it.
//
// So a provider reached over HTTPS is the path that actually delivers from a
// deployment, since nothing blocks port 443. Brevo is the one configured here.
// It is chosen ahead of SMTP when its key is present, which leaves local
// development free to carry on using Gmail.
const brevoConfigured = () => Boolean(process.env.BREVO_API_KEY);
const smtpConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);

// The test environment never sends. The suite drives the invitation and
// reminder paths through the API, so silencing mail in the test process alone
// achieves nothing - it is this process that would do the sending, to whatever
// addresses the fixtures happen to use, on a developer's own credentials.
//
// `loadtest` already marks this environment for the rate limiters, so there is
// no second switch to remember. It is set deliberately to run the suite and
// never in a deployment.
const underTest = () => process.env.NODE_ENV === 'loadtest';

const mailConfigured = () => !underTest() && (brevoConfigured() || smtpConfigured());

// Long enough for any reachable server, short enough that a caller still gets
// an answer. Without it, a blocked port costs minutes: an invitation once took
// 120 seconds to answer because nodemailer's own defaults are that patient.
const TIMEOUT_MS = Number(process.env.MAIL_TIMEOUT_MS) || Number(process.env.SMTP_TIMEOUT_MS) || 10000;

// Who the message comes from. Brevo will only accept a sender that has been
// verified in the account, so this is configuration rather than a constant.
const sender = () => {
  const address = process.env.MAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER;
  if (!address) return null;

  // Accepts either "Name <a@b.c>" or a bare address.
  const named = /^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/.exec(address);
  return named
    ? { name: named[1] || 'IntelliCare', email: named[2] }
    : { name: process.env.MAIL_FROM_NAME || 'IntelliCare', email: address };
};

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

// An ordinary HTTPS request, which is the whole point of it.
const viaBrevo = async ({ to, subject, text, from }) => {
  const abort = AbortSignal.timeout(TIMEOUT_MS);

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: from,
      to: [{ email: to }],
      subject,
      textContent: text,
    }),
    signal: abort,
  });

  if (response.ok) return { status: 'sent', detail: null };

  // Brevo explains a refusal in the body - an unverified sender, a recipient it
  // will not accept - and that is the part worth recording, not the status code.
  const body = await response.text().catch(() => '');
  throw new Error(`Brevo refused it (HTTP ${response.status}): ${body.slice(0, 300)}`);
};

const viaSmtp = async ({ to, subject, text, from }) => {
  await getTransport().sendMail({
    from: from.name ? `${from.name} <${from.email}>` : from.email,
    to,
    subject,
    text,
  });
  return { status: 'sent', detail: null };
};

// Returns what happened rather than throwing, so a caller sending in bulk can
// record the outcome per recipient and carry on.
const sendMail = async ({ to, subject, text }) => {
  if (!to) return { status: 'skipped', detail: 'no address on file' };

  if (!mailConfigured()) {
    const why = underTest() ? 'mail is off under test' : 'no mail provider configured';
    console.log(`[email skipped: ${why}] to=${to} subject="${subject}"`);
    return { status: 'skipped', detail: why };
  }

  const from = sender();
  if (!from) {
    console.log(`[email skipped: no sender address configured] to=${to}`);
    return { status: 'skipped', detail: 'no sender address configured' };
  }

  const deliver = brevoConfigured() ? viaBrevo : viaSmtp;

  try {
    return await deliver({ to, subject, text, from });
  } catch (err) {
    console.error(`Email to ${to} failed: ${err.message}`);
    return { status: 'failed', detail: err.message };
  }
};

module.exports = { sendMail, mailConfigured, smtpConfigured, brevoConfigured };
