const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

const {
  SEEDED,
  PASSWORD,
  get,
  post,
  put,
  del,
  login,
  requireRunningApi,
  unique,
  patientIdFor,
} = require('./helpers');

describe('Patients', () => {
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

  describe('the directory', () => {
    it('is readable by staff', async () => {
      assert.equal((await get('/patients', clinician.token)).status, 200);
      assert.equal((await get('/patients', admin.token)).status, 200);
    });

    it('is not readable by a patient', async () => {
      assert.equal((await get('/patients', patient.token)).status, 403);
    });

    it('searches by name', async () => {
      const { json } = await get('/patients?search=Nafisah', clinician.token);
      assert.equal(json.patients.length, 1);
      assert.equal(json.patients[0].name, 'Nafisah Nuabh');
    });

    it('searches by email', async () => {
      const { json } = await get('/patients?search=peter.parker', clinician.token);
      assert.equal(json.patients.length, 1);
    });

    it('searches by the condition on the latest appointment', async () => {
      const { json } = await get('/patients?search=Chest', clinician.token);
      assert.ok(json.patients.some((row) => row.name === 'Elias Tobias'));
    });

    it('carries a condition on every row', async () => {
      const { json } = await get('/patients?limit=100', clinician.token);
      assert.ok(json.patients.every((row) => 'condition' in row));
    });

    it('filters by sex, and the filter narrows the whole set rather than one page', async () => {
      const all = await get('/patients?limit=100', clinician.token);
      const males = all.json.patients.filter((row) => row.sex === 'Male').length;

      const filtered = await get('/patients?sex=Male&page=1&limit=2', clinician.token);
      assert.ok(filtered.json.patients.every((row) => row.sex === 'Male'));
      assert.equal(filtered.json.total, males);
    });

    it('combines the filter with the search', async () => {
      const { json } = await get('/patients?sex=Male&search=Nafisah', clinician.token);
      assert.equal(json.total, 0);
    });

    it('paginates', async () => {
      const first = await get('/patients?page=1&limit=2', clinician.token);
      const second = await get('/patients?page=2&limit=2', clinician.token);

      assert.equal(first.json.patients.length, 2);
      assert.notEqual(first.json.patients[0].id, second.json.patients[0].id);
    });

    it('rejects a limit beyond the maximum', async () => {
      assert.equal((await get('/patients?limit=999', clinician.token)).status, 400);
    });
  });

  describe('a single record', () => {
    it('returns demographics, medications and visits', async () => {
      const { status, json } = await get(`/patients/${eliasId}`, clinician.token);
      assert.equal(status, 200);

      const record = json.patient;
      assert.equal(typeof record.name, 'string');
      assert.equal(typeof record.dateOfBirth, 'string');
      assert.ok(Array.isArray(record.medicalHistory));
      assert.ok(Array.isArray(record.allergies));
      assert.ok(Array.isArray(record.prescriptions));
      assert.ok(Array.isArray(record.appointments));
    });

    it('never exposes the password hash', async () => {
      const { json } = await get(`/patients/${eliasId}`, clinician.token);
      assert.equal(json.patient.passwordHash, undefined);
    });

    it('returns visits newest first, which the record relies on', async () => {
      const { json } = await get(`/patients/${eliasId}`, clinician.token);
      const times = json.patient.appointments.map((a) => new Date(a.scheduledAt).getTime());
      assert.deepEqual(times, [...times].sort((a, b) => b - a));
    });

    it('lets a patient read their own record', async () => {
      assert.equal((await get(`/patients/${eliasId}`, patient.token)).status, 200);
    });

    it("refuses a patient another patient's record", async () => {
      assert.equal((await get(`/patients/${otherId}`, patient.token)).status, 403);
    });

    it('answers 404 for an unknown id and 400 for a malformed one', async () => {
      assert.equal((await get('/patients/999999', clinician.token)).status, 404);
      assert.equal((await get('/patients/abc', clinician.token)).status, 400);
    });
  });

  describe('administering a record', () => {
    const newPatient = () => ({
      email: `${unique('patient')}@example.com`,
      password: PASSWORD,
      name: 'Test Patient',
      phone: '(902) 555-0900',
      dateOfBirth: '1990-01-01',
      sex: 'Other',
      address: '1 Test St.',
      medicalHistory: ['Asthma'],
      allergies: ['Peanuts'],
    });

    it('creates the account and the profile together', async () => {
      const account = newPatient();
      const { status, json } = await post('/patients', admin.token, account);

      assert.equal(status, 201);
      assert.ok(json.patient.userId > 0, 'profile is linked to a user row');

      const signedIn = await login(account.email);
      assert.equal(signedIn.user.role, 'patient');

      await del(`/patients/${json.patient.id}`, admin.token);
    });

    it('refuses creation by a clinician', async () => {
      assert.equal((await post('/patients', clinician.token, newPatient())).status, 403);
    });

    it('refuses a duplicate email', async () => {
      const account = newPatient();
      const created = await post('/patients', admin.token, account);
      assert.equal((await post('/patients', admin.token, account)).status, 409);
      await del(`/patients/${created.json.patient.id}`, admin.token);
    });

    it('records a health card number and returns it', async () => {
      const account = newPatient();
      const created = await post('/patients', admin.token, {
        ...account,
        healthCardNumber: '1234 567 890 AB',
      });

      assert.equal(created.json.patient.healthCardNumber, '1234 567 890 AB');

      const read = await get(`/patients/${created.json.patient.id}`, admin.token);
      assert.equal(read.json.patient.healthCardNumber, '1234 567 890 AB', 'and it persists');

      await del(`/patients/${created.json.patient.id}`, admin.token);
    });

    it('names the fields it rejected, so a form can mark them', async () => {
      const { status, json } = await post('/patients', admin.token, {
        ...newPatient(),
        email: 'not-an-email',
        password: 'short',
      });

      assert.equal(status, 400);
      assert.ok(Array.isArray(json.fields), 'the response says which fields failed');
      assert.ok(json.fields.includes('email'));
      assert.ok(json.fields.includes('password'));
    });

    it('validates the body', async () => {
      assert.equal((await post('/patients', admin.token, { ...newPatient(), email: 'nope' })).status, 400);
      assert.equal((await post('/patients', admin.token, { ...newPatient(), password: 'abc' })).status, 400);
      assert.equal((await post('/patients', admin.token, { ...newPatient(), sex: 'Unknown' })).status, 400);
    });

    it('updates across both tables without disturbing untouched fields', async () => {
      const created = await post('/patients', admin.token, newPatient());
      const id = created.json.patient.id;

      const { status, json } = await put(`/patients/${id}`, admin.token, {
        name: 'Renamed Patient',
        address: '2 Changed Ave.',
        allergies: ['Peanuts', 'Latex'],
      });

      assert.equal(status, 200);
      assert.equal(json.patient.name, 'Renamed Patient', 'name lives on the user row');
      assert.equal(json.patient.address, '2 Changed Ave.', 'address lives on the profile');
      assert.equal(json.patient.allergies.length, 2);
      assert.equal(json.patient.sex, 'Other', 'a field that was not sent is left alone');

      await del(`/patients/${id}`, admin.token);
    });

    it('updates the health card number too', async () => {
      const created = await post('/patients', admin.token, newPatient());
      const id = created.json.patient.id;

      const { json } = await put(`/patients/${id}`, admin.token, {
        healthCardNumber: '9999 888 777 ZZ',
      });
      assert.equal(json.patient.healthCardNumber, '9999 888 777 ZZ');

      await del(`/patients/${id}`, admin.token);
    });

    it('soft deletes, so the record leaves the directory but the row survives', async () => {
      const created = await post('/patients', admin.token, newPatient());
      const id = created.json.patient.id;

      const before = (await get('/patients?limit=100', clinician.token)).json.total;
      assert.equal((await del(`/patients/${id}`, clinician.token)).status, 403, 'clinicians cannot delete');
      assert.equal((await del(`/patients/${id}`, admin.token)).status, 200);

      const after = (await get('/patients?limit=100', clinician.token)).json.total;
      assert.equal(before - after, 1);
      assert.equal((await get(`/patients/${id}`, clinician.token)).status, 404);
    });
  });
});
