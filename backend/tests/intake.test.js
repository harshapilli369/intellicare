const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const { connectMySQL, sequelize } = require('../src/config/mysql');
const { connectMongoDB } = require('../src/config/mongodb');
const IntakeSubmission = require('../src/models/mongodb/IntakeSubmission');
const { buildPatientContext } = require('../src/services/clinicalContext');

const { SEEDED, BASE, get, post, patch, login, requireRunningApi, patientIdFor } = require('./helpers');

// Sends the form the way a browser does: multipart, with optional files.
const submitIntake = async (token, appointmentId, answers, files = []) => {
  const form = new FormData();
  Object.entries(answers).forEach(([field, value]) => {
    if (value !== undefined && value !== null && value !== '') form.append(field, String(value));
  });
  // The type is declared, as a browser declares it. Uploads are filtered on it,
  // so a file with no stated type is refused - which is the intended behaviour
  // and not something a fixture should be quietly exempt from.
  files.forEach((file) =>
    form.append(
      'attachments',
      new Blob([file.content], { type: file.type || 'application/pdf' }),
      file.name
    )
  );

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
        [{ name: 'lab-report.pdf', type: 'application/pdf', content: 'Haemoglobin 140 g/L' }]
      );
    });

    it('is readable by the clinician, with the attachment listed but not inlined', async () => {
      const { status, json } = await get(`/intake/appointment/${upcoming.id}`, clinician.token);

      assert.equal(status, 200);
      assert.equal(json.intake.mainComplaint, 'Chest tightness on exertion');
      assert.equal(json.intake.attachments.length, 1);
      assert.equal(json.intake.attachments[0].filename, 'lab-report.pdf');
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

    // Raised by a static scan: the download echoed the type and the name the
    // uploader supplied, straight into response headers. A file stored as
    // text/html would have been served back as a page from this origin, and a
    // name containing a quote could end the Content-Disposition field early and
    // turn `attachment` into `inline`.
    it('will not store a file the browser might execute', async () => {
      const { status, json } = await submitIntake(
        patient.token,
        upcoming.id,
        { mainComplaint: 'Attachment type check' },
        [{ name: 'evil.html', type: 'text/html', content: '<script>alert(1)</script>' }]
      );

      assert.equal(status, 400);
      assert.match(json.message, /images and PDFs/);
    });

    it('serves an attachment as a download, typed and named safely', async () => {
      const response = await fetch(`${BASE}/intake/appointment/${upcoming.id}/attachment/0`, {
        headers: { Authorization: `Bearer ${clinician.token}` },
      });

      assert.equal(response.headers.get('content-type'), 'application/pdf');
      assert.equal(
        response.headers.get('content-disposition'),
        'attachment; filename="lab-report.pdf"'
      );
      assert.equal(
        response.headers.get('x-content-type-options'),
        'nosniff',
        'the browser is told not to guess a more dangerous type'
      );
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

  // Intake worked, but only as something a patient volunteered. There was no
  // way for the clinic to ask, so nothing was ever outstanding and the
  // dashboard the proposal describes had nothing to put on it.
  describe('the clinic asking for a form', () => {
    // A visit of its own, so asking about it cannot disturb the fixtures the
    // rest of the file shares.
    const bookOne = async () => {
      const { json: staff } = await get('/users/clinicians', patient.token);
      const doc = staff.clinicians[0];

      const when = new Date();
      when.setDate(when.getDate() + 11);
      const date = when.toISOString().slice(0, 10);

      const { json: free } = await get(
        `/appointments/availability?clinicianId=${doc.id}&date=${date}`,
        patient.token
      );

      const { json } = await post('/appointments', patient.token, {
        clinicianId: doc.id,
        scheduledAt: free.slots[free.slots.length - 1],
        reason: 'Shoulder pain',
      });
      return json.appointment;
    };

    const outstandingFor = async (token) =>
      (await get('/intake/outstanding', token)).json.outstanding;

    it('puts the request on the patient dashboard, with the visit and the note', async () => {
      const visit = await bookOne();

      const asked = await post(`/intake/${visit.id}/request`, clinician.token, {
        message: 'Please describe the pain before you come in.',
      });
      assert.equal(asked.status, 201);

      const mine = (await outstandingFor(patient.token)).find(
        (o) => o.appointmentId === visit.id
      );

      assert.ok(mine, 'it is outstanding');
      assert.equal(mine.message, 'Please describe the pain before you come in.');
      assert.ok(mine.scheduledAt, 'and says which visit it is for');
      assert.ok(mine.clinicianName, 'and who is being seen');

      await patch(`/appointments/${visit.id}/cancel`, patient.token);
    });

    it('tells the patient in the app', async () => {
      const visit = await bookOne();
      await post(`/intake/${visit.id}/request`, clinician.token, {});

      const { json } = await get('/notifications', patient.token);
      assert.ok(
        json.notifications.some((n) => n.kind === 'intake-requested'),
        'a notification is raised'
      );

      await patch(`/appointments/${visit.id}/cancel`, patient.token);
    });

    it('settles when the patient fills it in', async () => {
      const visit = await bookOne();
      await post(`/intake/${visit.id}/request`, clinician.token, {});

      const before = await outstandingFor(patient.token);
      assert.ok(before.some((o) => o.appointmentId === visit.id));

      await submitIntake(patient.token, visit.id, { mainComplaint: 'A dull ache when lifting.' });

      const after = await outstandingFor(patient.token);
      assert.ok(
        !after.some((o) => o.appointmentId === visit.id),
        'no longer something the clinic is waiting on'
      );

      await patch(`/appointments/${visit.id}/cancel`, patient.token);
    });

    it('asking twice nudges rather than asking twice over', async () => {
      const visit = await bookOne();

      await post(`/intake/${visit.id}/request`, clinician.token, {});
      assert.equal((await post(`/intake/${visit.id}/request`, clinician.token, {})).status, 201);

      const mine = (await outstandingFor(patient.token)).filter(
        (o) => o.appointmentId === visit.id
      );
      assert.equal(mine.length, 1);

      await patch(`/appointments/${visit.id}/cancel`, patient.token);
    });

    it('will not ask for a form that has already been filled in', async () => {
      const visit = await bookOne();
      await submitIntake(patient.token, visit.id, { mainComplaint: 'Already said.' });

      const { status } = await post(`/intake/${visit.id}/request`, clinician.token, {});
      assert.equal(status, 409);

      await patch(`/appointments/${visit.id}/cancel`, patient.token);
    });

    it('will not ask about a visit that is not going ahead', async () => {
      const visit = await bookOne();
      await patch(`/appointments/${visit.id}/cancel`, patient.token);

      const { status } = await post(`/intake/${visit.id}/request`, clinician.token, {});
      assert.equal(status, 409, 'nothing to prepare for');
    });

    it('is the clinic asking, not the patient', async () => {
      const visit = await bookOne();

      assert.equal((await post(`/intake/${visit.id}/request`, patient.token, {})).status, 403);
      assert.equal((await post(`/intake/${visit.id}/request`, null, {})).status, 401);

      await patch(`/appointments/${visit.id}/cancel`, patient.token);
    });

    it("never shows one patient another patient's outstanding forms", async () => {
      const visit = await bookOne();
      await post(`/intake/${visit.id}/request`, clinician.token, {});

      const theirs = await outstandingFor(other.token);
      assert.ok(!theirs.some((o) => o.appointmentId === visit.id));

      // And staff have no such list of their own - it is a patient's view.
      assert.equal((await get('/intake/outstanding', clinician.token)).status, 403);

      await patch(`/appointments/${visit.id}/cancel`, patient.token);
    });

    // A request for a visit that has since been called off is not something to
    // chase, and must not sit on the dashboard for ever.
    it('drops out of the list when the visit is cancelled', async () => {
      const visit = await bookOne();
      await post(`/intake/${visit.id}/request`, clinician.token, {});
      assert.ok((await outstandingFor(patient.token)).some((o) => o.appointmentId === visit.id));

      await patch(`/appointments/${visit.id}/cancel`, patient.token);

      assert.ok(!(await outstandingFor(patient.token)).some((o) => o.appointmentId === visit.id));
    });
  });
});
