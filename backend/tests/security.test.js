const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

const { SEEDED, BASE, get, post, patch, login, requireRunningApi, patientIdFor } = require('./helpers');

describe('Security controls', () => {
  let clinician;
  let patient;
  let eliasId;
  let appointmentId;

  before(async () => {
    await requireRunningApi();
    clinician = await login(SEEDED.clinician);
    patient = await login(SEEDED.patient);
    eliasId = await patientIdFor(clinician.token, 'Elias Tobias');

    // A visit that actually has a summary on it, asked for directly rather than
    // found by scanning the chart. The most recent visit is a moving target -
    // other files book for this patient in parallel - and the chart carries
    // recent history rather than everything, so a seeded summary on an older
    // visit is not in it. The summaries endpoint names its own appointment.
    const released = await get(`/ai/patient/${eliasId}/summaries`, clinician.token);
    appointmentId = released.json.summaries[0]?.appointmentId;

    assert.ok(appointmentId, 'the seed needs one released summary to read');
  });

  describe('response headers', () => {
    it('denies every content source, since this process serves no pages', async () => {
      const response = await fetch(`${BASE}/health`);
      const csp = response.headers.get('content-security-policy');

      assert.ok(csp, 'a policy is sent');
      assert.match(csp, /default-src 'none'/);
      assert.match(csp, /frame-ancestors 'none'/, 'and it cannot be framed');
    });

    it('does not announce what it is running', async () => {
      const response = await fetch(`${BASE}/health`);
      assert.equal(response.headers.get('x-powered-by'), null);
    });

    it('asks browsers to keep using HTTPS', async () => {
      const response = await fetch(`${BASE}/health`);
      assert.ok(response.headers.get('strict-transport-security'));
    });

    it('sends no referrer to other sites', async () => {
      const response = await fetch(`${BASE}/health`);
      assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    });
  });

  describe('input is validated at the edge', () => {
    it('rejects a malformed id rather than passing it to the database', async () => {
      assert.equal((await get('/patients/abc', clinician.token)).status, 400);
      assert.equal((await get('/appointments/abc', clinician.token)).status, 400);
      assert.equal((await get('/ai/summary/abc', clinician.token)).status, 400);
      assert.equal((await get('/prescriptions/abc', clinician.token)).status, 400);
      assert.equal((await patch('/notifications/abc/read', patient.token)).status, 400);
    });

    it('refuses an object where a string belongs, so a query cannot be smuggled', async () => {
      const { status } = await post('/auth/login', null, {
        email: { $ne: null },
        password: { $ne: null },
      });
      assert.equal(status, 400);
    });

    it('bounds what it will accept', async () => {
      const tooLong = 'x'.repeat(30000);
      const { status } = await patch(`/ai/summary/${appointmentId}/finalize`, clinician.token, {
        clinicianSummary: tooLong,
      });
      assert.equal(status, 400);
    });
  });

  describe('a summary is finalized, not rewritten', () => {
    it('ignores fields the caller is not entitled to set', async () => {
      // Reassigning the summary to another patient would show it to them.
      const { status } = await patch(`/ai/summary/${appointmentId}/finalize`, clinician.token, {
        clinicianSummary: 'Reviewed and approved.',
        patientId: 999999,
        appointmentId: 1,
        finalized: false,
      });

      assert.equal(status, 200);

      const stored = await get(`/ai/summary/${appointmentId}`, clinician.token);
      assert.equal(stored.json.summary.patientId, eliasId, 'still belongs to the same patient');
      assert.equal(stored.json.summary.appointmentId, appointmentId, 'and the same appointment');
      assert.equal(stored.json.summary.finalized, true, 'and finalized means finalized');
    });
  });

  describe('errors say nothing useful to an attacker', () => {
    it('gives the same answer for an unknown account and a wrong password', async () => {
      const unknown = await post('/auth/login', null, {
        email: 'nobody@example.com',
        password: 'Password123!',
      });
      const wrong = await post('/auth/login', null, {
        email: SEEDED.clinician,
        password: 'not-the-password',
      });

      assert.equal(unknown.status, wrong.status);
      assert.equal(unknown.json.message, wrong.json.message);
    });

    it("reports another account's notification as absent rather than forbidden", async () => {
      // 403 would confirm the id exists, which 404 does not.
      const mine = await get('/notifications', patient.token);
      if (mine.json.notifications.length === 0) return;

      const { status } = await patch(
        `/notifications/${mine.json.notifications[0].id}/read`,
        clinician.token
      );
      assert.equal(status, 404);
    });
  });

  describe('rate limiting', () => {
    it('is configured, and the response says so', async () => {
      const response = await fetch(`${BASE}/health`);
      // The limiter advertises the window even when it is not being hit, so its
      // presence is verifiable without exhausting the allowance.
      assert.ok(
        response.headers.get('ratelimit-limit') || response.headers.get('x-ratelimit-limit'),
        'a limit is advertised on responses'
      );
    });
  });

  describe('nothing is reachable without a token', () => {
    it('refuses every route that carries patient information', async () => {
      for (const path of [
        '/patients',
        `/patients/${eliasId}`,
        '/appointments',
        `/notes/patient/${eliasId}`,
        `/prescriptions/patient/${eliasId}`,
        `/intake/appointment/${appointmentId}`,
        '/notifications',
        '/dashboard/clinician',
      ]) {
        assert.equal((await get(path, null)).status, 401, `${path} requires a token`);
      }
    });

    it('refuses a token it did not sign', async () => {
      const forged =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
        'eyJpZCI6MSwicm9sZSI6ImNsaW5pY2lhbiIsIm5hbWUiOiJGb3JnZWQifQ.' +
        'not-a-real-signature';
      assert.equal((await get('/patients', forged)).status, 401);
    });
  });
});
