const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const { connectMySQL, sequelize } = require('../src/config/mysql');
const { connectMongoDB } = require('../src/config/mongodb');
const IntakeSubmission = require('../src/models/mongodb/IntakeSubmission');
const { buildPatientContext } = require('../src/services/clinicalContext');

const { SEEDED, BASE, get, login, requireRunningApi, patientIdFor } = require('./helpers');

// Sends the form the way a browser does: multipart, with optional files.
const submitIntake = async (token, appointmentId, answers, files = []) => {
  const form = new FormData();
  Object.entries(answers).forEach(([field, value]) => {
    if (value !== undefined && value !== null && value !== '') form.append(field, String(value));
  });
  files.forEach((file) => form.append('attachments', new Blob([file.content]), file.name));

  const response = await fetch(`${BASE}/intake/${appointmentId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return { status: response.status, json: await response.json().catch(() => null) };
};

describe('Patient intake', () => {
  let clinician;
  let admin;
  let patient;
  let other;
  let eliasId;
  let upcoming;
  let othersAppointment;

  before(async () => {
    await requireRunningApi();
    await connectMySQL();
    await connectMongoDB();

    clinician = await login(SEEDED.clinician);
    admin = await login(SEEDED.admin);
    patient = await login(SEEDED.patient);
    other = await login(SEEDED.otherPatient);
    eliasId = await patientIdFor(clinician.token, 'Elias Tobias');

    const mine = (await get('/appointments', patient.token)).json.appointments;
    upcoming = mine.find((a) => a.status === 'scheduled');
    assert.ok(upcoming, 'the seed needs a scheduled appointment for this patient');

    const theirs = (await get('/appointments', other.token)).json.appointments;
    othersAppointment = theirs[0];
  });

  after(async () => {
    await IntakeSubmission.deleteMany({ appointmentId: upcoming.id });
    await sequelize.close();
    await mongoose.disconnect();
  });

  it('records what the patient submitted', async () => {
    const { status, json } = await submitIntake(patient.token, upcoming.id, {
      mainComplaint: 'Tightness in my chest when I climb stairs',
      durationDays: 12,
      severity: 6,
      medicationsTaken: 'Paracetamol, two a day',
      additionalNotes: 'It eases when I sit down',
    });

    assert.equal(status, 201);
    assert.equal(json.intake.mainComplaint, 'Tightness in my chest when I climb stairs');
    assert.equal(json.intake.durationDays, 12);
    assert.equal(json.intake.severity, 6);
    assert.equal(json.intake.appointmentId, upcoming.id);
    assert.equal(json.intake.patientId, eliasId, 'the patient comes from the token');
  });

  it('replaces the answers rather than stacking a second form', async () => {
    await submitIntake(patient.token, upcoming.id, { mainComplaint: 'Changed my mind' });

    const stored = await IntakeSubmission.find({ appointmentId: upcoming.id });
    assert.equal(stored.length, 1, 'one form per appointment');
    assert.equal(stored[0].mainComplaint, 'Changed my mind');
  });

  it('requires the main complaint', async () => {
    const { status } = await submitIntake(patient.token, upcoming.id, { severity: 5 });
    assert.equal(status, 400);
  });

  it('rejects a severity outside the scale', async () => {
    const { status } = await submitIntake(patient.token, upcoming.id, {
      mainComplaint: 'Something',
      severity: 99,
    });
    assert.equal(status, 400);
  });

  it('is only for the patient whose visit it is', async () => {
    const mine = await submitIntake(other.token, upcoming.id, { mainComplaint: 'Not mine' });
    assert.equal(mine.status, 403);

    const staff = await submitIntake(clinician.token, upcoming.id, { mainComplaint: 'Not mine' });
    assert.equal(staff.status, 403, 'a clinician does not fill in a patient form');
  });

  it('refuses an appointment that has already happened', async () => {
    const past = (await get('/appointments', patient.token)).json.appointments.find(
      (a) => a.status !== 'scheduled'
    );
    if (!past) return;

    const { status } = await submitIntake(patient.token, past.id, { mainComplaint: 'Too late' });
    assert.equal(status, 409);
  });

  describe('reading it back', () => {
    before(async () => {
      await submitIntake(
        patient.token,
        upcoming.id,
        { mainComplaint: 'Chest tightness on exertion', durationDays: 12, severity: 6 },
        [{ name: 'lab-report.txt', content: 'Haemoglobin 140 g/L' }]
      );
    });

    it('is readable by the clinician, with the attachment listed but not inlined', async () => {
      const { status, json } = await get(`/intake/appointment/${upcoming.id}`, clinician.token);

      assert.equal(status, 200);
      assert.equal(json.intake.mainComplaint, 'Chest tightness on exertion');
      assert.equal(json.intake.attachments.length, 1);
      assert.equal(json.intake.attachments[0].filename, 'lab-report.txt');
      assert.ok(json.intake.attachments[0].size > 0);
      assert.equal(
        json.intake.attachments[0].data,
        undefined,
        'the bytes are not carried in the listing'
      );
    });

    it('is readable by the patient who wrote it', async () => {
      assert.equal((await get(`/intake/appointment/${upcoming.id}`, patient.token)).status, 200);
    });

    it("is not readable by a different patient", async () => {
      assert.equal((await get(`/intake/appointment/${upcoming.id}`, other.token)).status, 404);
    });

    it('serves the attachment itself', async () => {
      const response = await fetch(`${BASE}/intake/appointment/${upcoming.id}/attachment/0`, {
        headers: { Authorization: `Bearer ${clinician.token}` },
      });
      assert.equal(response.status, 200);
      assert.equal(await response.text(), 'Haemoglobin 140 g/L');
    });

    it('refuses an attachment to someone the form is not about', async () => {
      const response = await fetch(`${BASE}/intake/appointment/${upcoming.id}/attachment/0`, {
        headers: { Authorization: `Bearer ${other.token}` },
      });
      assert.equal(response.status, 404);
    });

    it('answers 404 for an attachment that does not exist', async () => {
      const response = await fetch(`${BASE}/intake/appointment/${upcoming.id}/attachment/3`, {
        headers: { Authorization: `Bearer ${clinician.token}` },
      });
      assert.equal(response.status, 404);
    });

    it('answers 404 when no form was filled in', async () => {
      if (!othersAppointment) return;
      const { status } = await get(
        `/intake/appointment/${othersAppointment.id}`,
        clinician.token
      );
      assert.equal(status, 404);
    });
  });

  // The acceptance criterion: the clinician's pre-appointment context has to
  // carry it, since that is what the brief is generated from.
  describe('reaching the pre-appointment context', () => {
    it('appears in the context the AI brief is built from', async () => {
      await submitIntake(patient.token, upcoming.id, {
        mainComplaint: 'Chest tightness on exertion',
        durationDays: 12,
        severity: 6,
        medicationsTaken: 'Paracetamol',
      });

      const built = await buildPatientContext(upcoming.id);

      assert.ok(built.context.patientIntake, 'the intake reaches the context');
      assert.equal(built.context.patientIntake.mainComplaint, 'Chest tightness on exertion');
      assert.equal(built.context.patientIntake.durationDays, 12);
      assert.equal(built.context.patientIntake.severity, 6);
      assert.equal(built.context.patientIntake.medicationsTaken, 'Paracetamol');
    });

    it('changes the hash the summary cache is keyed on', async () => {
      const AISummary = require('../src/models/mongodb/AISummary');

      const before = await buildPatientContext(upcoming.id);
      const hashBefore = AISummary.hashInput(before.context);

      await submitIntake(patient.token, upcoming.id, {
        mainComplaint: 'Something quite different from before',
        severity: 9,
      });

      const after = await buildPatientContext(upcoming.id);
      const hashAfter = AISummary.hashInput(after.context);

      // The cache reuses a stored summary only while this hash is unchanged, so
      // a brief generated before the patient filled the form in is not served
      // afterwards as though it still described their situation.
      assert.notEqual(hashBefore, hashAfter, 'submitting intake invalidates a stored brief');
    });

    it('is null rather than missing when nothing was submitted', async () => {
      if (!othersAppointment) return;
      const built = await buildPatientContext(othersAppointment.id);

      assert.ok('patientIntake' in built.context, 'the field is always present');
      assert.equal(built.context.patientIntake, null, 'and says plainly that there was none');
    });
  });
});
