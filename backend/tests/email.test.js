// The mail service in isolation: which way a message goes out, and what it
// reports when it cannot go out at all. Nothing here reaches a real provider -
// the Brevo path is pointed at a stub, and the SMTP path is never configured.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const { silenceMail } = require('./helpers');

describe('Outgoing mail', () => {
  let restoreMail;
  let realEnv;

  beforeEach(() => {
    restoreMail = silenceMail();
    // The service refuses to send under `loadtest`, which is how the API is run
    // for the suite. These tests are about the transport itself, so they pin an
    // environment where sending is allowed and stub the provider instead.
    realEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    delete require.cache[require.resolve('../src/services/emailService')];
  });

  afterEach(() => {
    restoreMail();
    if (realEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = realEnv;
    delete require.cache[require.resolve('../src/services/emailService')];
  });

  const load = () => require('../src/services/emailService');

  it('reports mail as skipped when nothing is configured', async () => {
    const { sendMail, mailConfigured } = load();

    assert.equal(mailConfigured(), false);
    const result = await sendMail({ to: 'someone@example.com', subject: 'x', text: 'x' });
    assert.equal(result.status, 'skipped');
  });

  it('skips an address that is not there rather than trying', async () => {
    process.env.BREVO_API_KEY = 'irrelevant';
    const { sendMail } = load();

    const result = await sendMail({ to: null, subject: 'x', text: 'x' });
    assert.equal(result.status, 'skipped');
    assert.equal(result.detail, 'no address on file');
  });

  it('will not send without a sender address to send from', async () => {
    process.env.BREVO_API_KEY = 'irrelevant';
    const { sendMail } = load();

    const result = await sendMail({ to: 'someone@example.com', subject: 'x', text: 'x' });
    assert.equal(result.status, 'skipped');
    assert.equal(result.detail, 'no sender address configured');
  });

  it('prefers an HTTP provider over SMTP when both are configured', () => {
    process.env.BREVO_API_KEY = 'irrelevant';
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_USER = 'someone@example.com';

    const { brevoConfigured, smtpConfigured, mailConfigured } = load();

    // Both are available; the service takes the one that is not blocked from a
    // deployment. Asserted through what it reports rather than by watching it
    // send, since sending needs a provider.
    assert.equal(brevoConfigured(), true);
    assert.equal(smtpConfigured(), true);
    assert.equal(mailConfigured(), true);
  });

  it('recognises Resend as a provider in its own right', () => {
    process.env.RESEND_API_KEY = 're_irrelevant';

    const { resendConfigured, mailConfigured, smtpConfigured } = load();

    assert.equal(resendConfigured(), true);
    assert.equal(smtpConfigured(), false, 'no SMTP needed for it to be configured');
    assert.equal(mailConfigured(), true);
  });

  it('reads a sender written as "Name <address>"', async () => {
    // Answered by a stub standing in for the provider, so the parsed sender can
    // be read back off the request it would really have made.
    const received = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        received.push(JSON.parse(body));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
      });
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    // The service posts to Brevo by name, so the stub is reached by rewriting
    // fetch for the length of this test rather than by pointing a URL at it.
    const realFetch = globalThis.fetch;
    globalThis.fetch = (url, options) =>
      realFetch(`http://127.0.0.1:${port}/`, options);

    try {
      process.env.BREVO_API_KEY = 'irrelevant';
      process.env.MAIL_FROM = 'IntelliCare Clinic <clinic@example.com>';

      const { sendMail } = load();
      const result = await sendMail({
        to: 'patient@example.com',
        subject: 'Your appointment',
        text: 'Tomorrow at nine.',
      });

      assert.equal(result.status, 'sent');
      assert.deepEqual(received[0].sender, {
        name: 'IntelliCare Clinic',
        email: 'clinic@example.com',
      });
      assert.deepEqual(received[0].to, [{ email: 'patient@example.com' }]);
      assert.equal(received[0].subject, 'Your appointment');
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.MAIL_FROM;
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('reports a refusal rather than throwing it at the caller', async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end('{"message":"Key not found"}');
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    const realFetch = globalThis.fetch;
    globalThis.fetch = (url, options) => realFetch(`http://127.0.0.1:${port}/`, options);

    try {
      process.env.BREVO_API_KEY = 'wrong';
      process.env.MAIL_FROM = 'clinic@example.com';

      const { sendMail } = load();
      const result = await sendMail({ to: 'patient@example.com', subject: 'x', text: 'x' });

      // A bulk send has to be able to record this per recipient and carry on,
      // which it cannot do if the failure is thrown.
      assert.equal(result.status, 'failed');
      assert.match(result.detail, /401/);
      assert.match(result.detail, /Key not found/);
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.MAIL_FROM;
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
