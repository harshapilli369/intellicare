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

    // A report used to be headed with the date its summary was written, which
    // is when the clinician got round to it rather than when the patient was
    // seen. With no clinician or reason either, two reports were impossible to
    // tell apart.
    it('says which visit each report is about', async () => {
      const { json } = await get(`/ai/patient/${eliasId}/summaries`, patient.token);

      for (const report of json.summaries) {
        assert.ok(
          Object.hasOwn(report, 'appointment'),
          'every report carries the visit it describes'
        );
        if (!report.appointment) continue;

        assert.ok(report.appointment.scheduledAt, 'the date the patient was seen');
        assert.ok(
          Object.hasOwn(report.appointment, 'clinicianName'),
          'who they were seen by'
        );
        assert.ok(Object.hasOwn(report.appointment, 'reason'), 'what they were seen for');
      }
    });

    it('orders reports by the visit, not by when they were written', async () => {
      const { json } = await get(`/ai/patient/${eliasId}/summaries`, patient.token);

      const when = (report) =>
        new Date(report.appointment?.scheduledAt || report.createdAt).getTime();
      const dates = json.summaries.map(when);

      assert.deepEqual(
        dates,
        [...dates].sort((a, b) => b - a),
        'newest visit first, so finalizing an old summary does not push it to the top'
      );
    });

    it("cannot read another patient's summaries", async () => {
      const otherId = await patientIdFor(clinician.token, 'Sam Smith');
      assert.equal((await get(`/ai/patient/${otherId}/summaries`, patient.token)).status, 403);
    });

    // Everything a patient reaches on their first visit, not just the one
    // endpoint that happens to tolerate a half-built account.
    //
    // This test used to check `/appointments` alone, which returns an empty
    // list whether or not the account has a clinical profile - so it passed
    // while public sign-up was creating the sign-in account and not the
    // profile, and every other patient screen answered "we could not find
    // your dashboard". Signing up is only worth anything if what follows works.
    it('gives a brand new account a usable set of screens', async () => {
      const { post, PASSWORD, unique } = require('./helpers');
      const email = `${unique('fresh')}@example.com`;

      const created = await post('/auth/register', null, {
        email,
        password: PASSWORD,
        name: 'Fresh Patient',
      });
      assert.equal(created.status, 201);
      const token = created.json.token;

      const dashboard = await get('/dashboard/patient', token);
      assert.equal(dashboard.status, 200, 'the dashboard loads');
      assert.ok(dashboard.json.patientId, 'and the account has a clinical profile behind it');

      const appointments = await get('/appointments', token);
      assert.equal(appointments.status, 200);
      assert.deepEqual(appointments.json.appointments, [], 'nothing booked yet');

      const reports = await get(`/ai/patient/${dashboard.json.patientId}/summaries`, token);
      assert.equal(reports.status, 200, 'reports load');

      const outstanding = await get('/intake/outstanding', token);
      assert.equal(outstanding.status, 200, 'outstanding intake loads');

      const preferences = await get('/patients/me/reminder-preferences', token);
      assert.equal(preferences.status, 200, 'reminder settings load');

      const record = await get(`/patients/${dashboard.json.patientId}`, token);
      assert.equal(record.status, 200, 'they can read their own record');
      assert.equal(record.json.patient.name, 'Fresh Patient');
    });
  });

  describe('the appointment notes panel', () => {
    it('returns the fields the panel decides Edit visibility from', async () => {
      const { post } = require('./helpers');
      const record = await get(`/patients/${eliasId}`, clinician.token);
      const appointmentId = record.json.patient.appointments[0].id;

      await post('/notes', clinician.token, {
        appointmentId,
        body: 'Written so the panel has something to render.',
      });

      const { status, json } = await get(`/notes/appointment/${appointmentId}`, clinician.token);
      assert.equal(status, 200);
      assert.ok(json.notes.length > 0);

      for (const note of json.notes) {
        assert.equal(typeof note.id, 'string', 'an id to edit against');
        assert.equal(typeof note.body, 'string', 'a body to show');
        assert.equal(typeof note.authorId, 'number', 'an author, to offer Edit only on your own');
        assert.ok(note.createdAt, 'a timestamp, to tell whether the window has closed');
      }
    });

    it('is closed to a patient, who has no entry point to it', async () => {
      const record = await get(`/patients/${eliasId}`, clinician.token);
      const appointmentId = record.json.patient.appointments[0].id;
      assert.equal((await get(`/notes/appointment/${appointmentId}`, patient.token)).status, 403);
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
