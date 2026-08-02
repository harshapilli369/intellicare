const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

const { SEEDED, get, post, login, requireRunningApi, patientIdFor } = require('./helpers');

describe('Prescriptions', () => {
  let clinician;
  let admin;
  let patient;
  let eliasId;
  let otherId;

  before(async () => {
    await requireRunningApi();
    clinician = await login(SEEDED.clinician);
    admin = await login(SEEDED.admin);
    patient = await login(SEEDED.patient);
    eliasId = await patientIdFor(clinician.token, 'Elias Tobias');
    otherId = await patientIdFor(clinician.token, 'Sam Smith');
  });

  describe('the reference list', () => {
    it('is readable by staff and names what may be prescribed', async () => {
      const { status, json } = await get('/prescriptions/formulary', clinician.token);
      assert.equal(status, 200);
      assert.ok(json.medications.length > 0);
      assert.ok(json.medications.every((m) => m.name));
    });

    it('covers everything the seed issues', async () => {
      const { json } = await get('/prescriptions/formulary', clinician.token);
      const names = json.medications.map((m) => m.name);

      const record = await get(`/patients/${eliasId}`, clinician.token);
      for (const existing of record.json.patient.prescriptions) {
        assert.ok(
          names.includes(existing.medication),
          `${existing.medication} from the seed is on the reference list`
        );
      }
    });

    it('is not routed as a patient id', async () => {
      const { status } = await get('/prescriptions/formulary', clinician.token);
      assert.equal(status, 200, '"formulary" is not read as a patient id');
    });
  });

  describe('issuing one', () => {
    const script = (overrides = {}) => ({
      patientId: eliasId,
      medication: 'Amoxicillin',
      dosage: '500mg',
      frequency: 'three times daily',
      route: 'oral',
      duration: '7 days',
      ...overrides,
    });

    it('is the clinician\'s alone', async () => {
      assert.equal((await post('/prescriptions', admin.token, script())).status, 403);
      assert.equal((await post('/prescriptions', patient.token, script())).status, 403);
      assert.equal((await post('/prescriptions', null, script())).status, 401);
    });

    it('saves one and records who issued it', async () => {
      const { status, json } = await post('/prescriptions', clinician.token, script());

      assert.equal(status, 201);
      assert.equal(json.prescription.medication, 'Amoxicillin');
      assert.equal(json.prescription.patientId, eliasId);
      assert.equal(json.prescription.clinicianId, clinician.user.id, 'taken from the token');
      assert.equal(json.prescription.clinicianName, 'Mariam Kuteishi');
    });

    it('works out when the course runs out', async () => {
      const { json } = await post('/prescriptions', clinician.token, script({ duration: '7 days' }));

      assert.ok(json.prescription.runsOutOn, 'an end date is derived from the duration');
      assert.equal(json.prescription.current, true, 'a course just started is current');

      const days =
        (new Date(json.prescription.runsOutOn) - new Date(json.prescription.issuedOn)) / 86_400_000;
      assert.ok(Math.round(days) === 7, 'seven days after it was issued');
    });

    it('leaves the end date open when the duration cannot be read', async () => {
      const { json } = await post(
        '/prescriptions',
        clinician.token,
        script({ duration: 'until review' })
      );

      assert.equal(json.prescription.runsOutOn, null, 'nothing is guessed');
      assert.equal(json.prescription.current, true, 'and it counts as ongoing');
    });

    it('refuses a medication that is not on the list', async () => {
      const { status, json } = await post(
        '/prescriptions',
        clinician.token,
        script({ medication: 'Essence of Nonsense' })
      );

      assert.equal(status, 400);
      assert.match(json.message, /reference list/i);
    });

    it('stores the reference spelling, not what was typed', async () => {
      const { json } = await post(
        '/prescriptions',
        clinician.token,
        script({ medication: '  amOxiCILLin  ' })
      );
      assert.equal(json.prescription.medication, 'Amoxicillin');
    });

    it('refuses an unknown patient', async () => {
      const { status } = await post('/prescriptions', clinician.token, script({ patientId: 999999 }));
      assert.equal(status, 404);
    });

    it("refuses an appointment belonging to a different patient", async () => {
      const record = await get(`/patients/${otherId}`, clinician.token);
      const theirs = record.json.patient.appointments[0];
      if (!theirs) return;

      const { status, json } = await post(
        '/prescriptions',
        clinician.token,
        script({ appointmentId: theirs.id })
      );

      assert.equal(status, 400);
      assert.match(json.message, /different patient/i);
    });

    it('links to the visit it was written during', async () => {
      const record = await get(`/patients/${eliasId}`, clinician.token);
      const theirs = record.json.patient.appointments[0];

      const { json } = await post(
        '/prescriptions',
        clinician.token,
        script({ appointmentId: theirs.id })
      );
      assert.equal(json.prescription.appointmentId, theirs.id);
    });
  });

  describe('the printable copy', () => {
    let issued;

    before(async () => {
      issued = (
        await post('/prescriptions', clinician.token, {
          patientId: eliasId,
          medication: 'Metformin',
          dosage: '500mg',
          frequency: 'twice daily',
          duration: '90 days',
        })
      ).json.prescription;
    });

    it('carries everything a printed sheet shows', async () => {
      const { status, json } = await get(`/prescriptions/${issued.id}`, clinician.token);

      assert.equal(status, 200);
      assert.equal(json.prescription.patientName, 'Elias Tobias', 'who it is for');
      assert.equal(json.prescription.clinicianName, 'Mariam Kuteishi', 'who wrote it');
      assert.equal(json.prescription.medication, 'Metformin');
      assert.ok(json.prescription.issuedOn, 'when it was issued');
      assert.ok(json.prescription.runsOutOn, 'and when it runs out');
    });

    it('can be printed by the patient it belongs to', async () => {
      assert.equal((await get(`/prescriptions/${issued.id}`, patient.token)).status, 200);
    });

    it("cannot be printed by a different patient", async () => {
      const theirs = (
        await post('/prescriptions', clinician.token, {
          patientId: otherId,
          medication: 'Ibuprofen',
          duration: '5 days',
        })
      ).json.prescription;

      assert.equal((await get(`/prescriptions/${theirs.id}`, patient.token)).status, 403);
    });

    it('answers 404 for one that does not exist and 400 for a malformed id', async () => {
      assert.equal((await get('/prescriptions/999999', clinician.token)).status, 404);
      assert.equal((await get('/prescriptions/abc', clinician.token)).status, 400);
    });

    it('does not swallow the formulary or the patient list paths', async () => {
      assert.equal((await get('/prescriptions/formulary', clinician.token)).status, 200);
      assert.equal((await get(`/prescriptions/patient/${eliasId}`, clinician.token)).status, 200);
    });
  });

  describe('reading a medication list', () => {
    it('appears on the patient record, which is the acceptance criterion', async () => {
      const issued = await post('/prescriptions', clinician.token, {
        patientId: eliasId,
        medication: 'Cetirizine',
        dosage: '10mg',
        duration: '30 days',
      });
      assert.equal(issued.status, 201);

      const { json } = await get(`/patients/${eliasId}`, clinician.token);
      const { prescriptions, totals } = json.patient;

      // Asked whether the new one is there, rather than whether the list grew.
      // The chart carries recent history rather than every row a patient has
      // ever accumulated, so on a long record the list is capped and counting
      // it measures the cap instead of the prescription.
      assert.ok(
        prescriptions.some((p) => p.id === issued.json.prescription.id),
        'the prescription just written is on the record'
      );
      assert.equal(prescriptions[0].medication, 'Cetirizine', 'and newest first, so it leads');
      assert.ok(totals.prescriptions >= prescriptions.length, 'the full count is reported too');
    });

    it('splits current from past', async () => {
      const { status, json } = await get(`/prescriptions/patient/${eliasId}`, clinician.token);

      assert.equal(status, 200);
      assert.equal(json.current.length + json.past.length, json.prescriptions.length);
      assert.ok(json.current.every((p) => p.current));
      assert.ok(json.past.every((p) => !p.current));
    });

    it('lets a patient read their own list', async () => {
      const { status, json } = await get(`/prescriptions/patient/${eliasId}`, patient.token);
      assert.equal(status, 200);
      assert.ok(Array.isArray(json.prescriptions));
    });

    it("refuses a patient another patient's list", async () => {
      assert.equal((await get(`/prescriptions/patient/${otherId}`, patient.token)).status, 403);
    });

    it('rejects a malformed patient id', async () => {
      assert.equal((await get('/prescriptions/patient/abc', clinician.token)).status, 400);
    });
  });
});
