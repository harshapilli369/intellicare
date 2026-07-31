// The data each screen depends on. These are not UI tests; they assert that the
// exact calls a screen makes return the fields it renders, which is what breaks
// when an endpoint changes shape underneath it.
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

const {
  SEEDED,
  get,
  login,
  requireRunningApi,
  daysFromNow,
  patientIdFor,
} = require('./helpers');

describe('Screen data', () => {
  let clinician;
  let patient;
  let eliasId;

  before(async () => {
    await requireRunningApi();
    clinician = await login(SEEDED.clinician);
    patient = await login(SEEDED.patient);
    eliasId = await patientIdFor(clinician.token, 'Elias Tobias');
  });

  describe("the clinician's day", () => {
    it('returns the day in time order with everything a card shows', async () => {
      const today = daysFromNow(0);
      const { status, json } = await get(
        `/appointments?clinicianId=${clinician.user.id}&from=${today}&to=${today}`,
        clinician.token
      );

      assert.equal(status, 200);
      const day = json.appointments;

      assert.ok(day.every((a) => !!a.patientName), 'a name to show');
      assert.ok(day.every((a) => !!a.patientId), 'a patient to open');
      assert.ok(day.every((a) => !!a.id), 'an appointment to brief on');
      assert.ok(day.every((a) => !!a.status), 'a status to reflect');
      assert.ok(day.every((a) => a.clinicianId === clinician.user.id), 'only this clinician');

      const times = day.map((a) => new Date(a.scheduledAt).getTime());
      assert.deepEqual(times, [...times].sort((a, b) => a - b));
    });

    it('returns an empty day rather than an error', async () => {
      const { status, json } = await get(
        `/appointments?clinicianId=${clinician.user.id}&from=2020-01-01&to=2020-01-01`,
        clinician.token
      );
      assert.equal(status, 200);
      assert.deepEqual(json.appointments, []);
    });

    it('reaches the two places a slot links to', async () => {
      const today = daysFromNow(0);
      const { json } = await get(
        `/appointments?clinicianId=${clinician.user.id}&from=${today}&to=${today}`,
        clinician.token
      );
      const first = json.appointments[0];
      if (!first) return;

      assert.equal((await get(`/patients/${first.patientId}`, clinician.token)).status, 200);
      const summary = await get(`/ai/summary/${first.id}`, clinician.token);
      assert.ok([200, 404].includes(summary.status), 'either a summary or a clean "none yet"');
    });
  });

  describe("the patient's dashboard", () => {
    it('reads their appointments, scoped to them', async () => {
      const { status, json } = await get('/appointments', patient.token);

      assert.equal(status, 200);
      assert.ok(json.appointments.every((a) => a.patientId === eliasId));
      assert.ok(json.appointments.every((a) => !!a.clinicianName), 'a clinician to name');
    });

    it('reads their own finalized summaries', async () => {
      const { status, json } = await get(`/ai/patient/${eliasId}/summaries`, patient.token);
      assert.equal(status, 200);
      assert.ok(Array.isArray(json.summaries));
    });

    it("cannot read another patient's summaries", async () => {
      const otherId = await patientIdFor(clinician.token, 'Sam Smith');
      assert.equal((await get(`/ai/patient/${otherId}/summaries`, patient.token)).status, 403);
    });

    it('gives a brand new account an empty list rather than an error', async () => {
      const { post, PASSWORD, unique } = require('./helpers');
      const email = `${unique('fresh')}@example.com`;
      const created = await post('/auth/register', null, {
        email,
        password: PASSWORD,
        name: 'Fresh Patient',
      });

      const { status, json } = await get('/appointments', created.json.token);
      assert.equal(status, 200);
      assert.deepEqual(json.appointments, []);
    });
  });

  describe('the patient record', () => {
    it('returns every field the record renders', async () => {
      const { json } = await get(`/patients/${eliasId}`, clinician.token);
      const record = json.patient;

      for (const field of ['name', 'sex', 'dateOfBirth', 'address', 'phone']) {
        assert.equal(typeof record[field], 'string', `${field} is present`);
      }
      assert.ok(record.prescriptions.every((p) => !!p.medication));
      assert.ok(record.appointments.every((a) => !!a.id && !!a.scheduledAt));
    });
  });
});
