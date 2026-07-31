const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

const {
  SEEDED,
  PASSWORD,
  get,
  post,
  patch,
  login,
  requireRunningApi,
  unique,
  patientIdFor,
} = require('./helpers');

describe('Clinical notes', () => {
  let clinician;
  let admin;
  let patient;
  let eliasId;
  let appointmentId;

  before(async () => {
    await requireRunningApi();
    clinician = await login(SEEDED.clinician);
    admin = await login(SEEDED.admin);
    patient = await login(SEEDED.patient);
    eliasId = await patientIdFor(clinician.token, 'Elias Tobias');

    const record = await get(`/patients/${eliasId}`, clinician.token);
    appointmentId = record.json.patient.appointments[0].id;
  });

  it('is closed to patients and administrators', async () => {
    assert.equal((await get(`/notes/patient/${eliasId}`, patient.token)).status, 403);
    assert.equal((await get(`/notes/patient/${eliasId}`, admin.token)).status, 403);
    assert.equal((await get(`/notes/patient/${eliasId}`, null)).status, 401);
  });

  it('records a note against an appointment, its patient and its author', async () => {
    const { status, json } = await post('/notes', clinician.token, {
      appointmentId,
      body: 'Patient reports intermittent chest tightness on exertion.',
    });

    assert.equal(status, 201);
    assert.equal(json.note.appointmentId, appointmentId);
    assert.equal(json.note.patientId, eliasId, 'the patient comes from the appointment, not the client');
    assert.equal(json.note.authorId, clinician.user.id);
  });

  it('refuses a note against an appointment that does not exist', async () => {
    const { status } = await post('/notes', clinician.token, { appointmentId: 999999, body: 'x' });
    assert.equal(status, 404);
  });

  it('refuses an empty note and a missing appointment', async () => {
    assert.equal((await post('/notes', clinician.token, { appointmentId, body: '   ' })).status, 400);
    assert.equal((await post('/notes', clinician.token, { body: 'x' })).status, 400);
  });

  it('reads a patient history back in the order it happened', async () => {
    const before = (await get(`/notes/patient/${eliasId}`, clinician.token)).json.notes.length;

    await post('/notes', clinician.token, { appointmentId, body: 'A later entry.' });

    const { json } = await get(`/notes/patient/${eliasId}`, clinician.token);
    assert.equal(json.notes.length, before + 1);

    const times = json.notes.map((note) => new Date(note.createdAt).getTime());
    assert.deepEqual(times, [...times].sort((a, b) => a - b), 'oldest first');
  });

  it('reads the notes for a single visit', async () => {
    const { json } = await get(`/notes/appointment/${appointmentId}`, clinician.token);
    assert.ok(json.notes.length > 0);
    assert.ok(json.notes.every((note) => note.appointmentId === appointmentId));
  });

  it('lets the author revise a note inside the window', async () => {
    const created = await post('/notes', clinician.token, { appointmentId, body: 'First draft.' });

    const { status, json } = await patch(`/notes/${created.json.note.id}`, clinician.token, {
      body: 'Revised: referred to cardiology.',
    });

    assert.equal(status, 200);
    assert.equal(json.note.body, 'Revised: referred to cardiology.');
  });

  it('validates the note id', async () => {
    assert.equal((await patch('/notes/not-an-id', clinician.token, { body: 'x' })).status, 400);
    assert.equal(
      (await patch('/notes/64b7f9c2e1a2c3d4e5f60718', clinician.token, { body: 'x' })).status,
      404
    );
  });

  it("will not let one clinician revise another's note", async () => {
    const mine = await post('/notes', clinician.token, {
      appointmentId,
      body: 'Written by the first clinician.',
    });

    // A second clinician has to be created by an administrator; registering
    // would produce a patient and be stopped by the role gate instead, which
    // would not exercise the authorship rule.
    const account = {
      email: `${unique('second.clinician')}@intellicare.ca`,
      password: PASSWORD,
      name: 'Second Clinician',
      role: 'clinician',
    };
    await post('/auth/staff', admin.token, account);
    const other = await login(account.email);

    assert.equal(
      (await get(`/notes/patient/${eliasId}`, other.token)).status,
      200,
      'the second clinician passes the role gate'
    );

    const { status } = await patch(`/notes/${mine.json.note.id}`, other.token, {
      body: 'Rewritten by someone else.',
    });
    assert.equal(status, 403, 'and is still refused on authorship');

    const readBack = await get(`/notes/appointment/${appointmentId}`, clinician.token);
    const untouched = readBack.json.notes.find((note) => note.id === mine.json.note.id);
    assert.equal(untouched.body, 'Written by the first clinician.');
  });
});
