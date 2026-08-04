const nodemailer = require('nodemailer');

const logger = require('../config/logger');

const log = logger.child({ service: 'email' });

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
// deployment, since nothing blocks port 443. Two are supported, and whichever
// is configured is used ahead of SMTP - which leaves local development free to
// carry on with Gmail.
//
// Resend is the one to reach for first. It needs no verified domain to start:
// sending from `onboarding@resend.dev` works the moment an account exists, with
// the limitation that it will only deliver to the address the account was
// registered with. That is useless for a clinic and entirely sufficient for a
// demonstration, where the recipient is chosen by whoever is presenting.
//
// Brevo verifies a single sender address instead and will then deliver to
// anybody, which is the better answer once real people are involved.
const resendConfigured = () => Boolean(process.env.RESEND_API_KEY);
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

const mailConfigured = () =>
  !underTest() && (resendConfigured() || brevoConfigured() || smtpConfigured());

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
const viaResend = async ({ to, subject, text, from }) => {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: from.name ? `${from.name} <${from.email}>` : from.email,
      to: [to],
      subject,
      text,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (response.ok) return { status: 'sent', detail: null };

  // Resend explains a refusal in the body, and the explanation is usually the
  // one that matters: without a verified domain it will only deliver to the
  // address the account was registered with, and says so plainly.
  const body = await response.text().catch(() => '');
  throw new Error(`Resend refused it (HTTP ${response.status}): ${body.slice(0, 300)}`);
};

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
    log.debug({ to, subject, reason: why }, 'email skipped');
    return { status: 'skipped', detail: why };
  }

  const from = sender();
  if (!from) {
    log.warn({ to }, 'email skipped: no sender address configured');
    return { status: 'skipped', detail: 'no sender address configured' };
  }

  // HTTP providers first: they are the ones that work from a deployment.
  const via = resendConfigured() ? 'resend' : brevoConfigured() ? 'brevo' : 'smtp';
  const deliver = via === 'resend' ? viaResend : via === 'brevo' ? viaBrevo : viaSmtp;

  try {
    const result = await deliver({ to, subject, text, from });
    log.info({ to, subject, via }, 'email sent');
    return result;
  } catch (err) {
    // Reported, not thrown - a caller sending in bulk records the outcome per
    // recipient and carries on. Logged at error because a message that did not
    // arrive is something somebody needs to know about.
    log.error({ to, subject, err: { message: err.message } }, 'email failed');
    return { status: 'failed', detail: err.message };
  }
};

module.exports = {
  sendMail,
  mailConfigured,
  smtpConfigured,
  brevoConfigured,
  resendConfigured,
};
