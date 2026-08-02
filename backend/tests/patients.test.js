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
      const small = await get('/patients?sex=Male&page=1&limit=2', clinician.token);
      assert.ok(small.json.patients.every((row) => row.sex === 'Male'));
      assert.ok(small.json.total >= small.json.patients.length, 'a total beyond the page');

      // Walked page by page rather than counting males inside one unfiltered
      // read. That read is capped at a hundred, so on any database with more
      // patients than that it stops being "the whole set" and the assertion
      // starts describing a page instead of the filter.
      const first = await get('/patients?sex=Male&page=1&limit=100', clinician.token);
      let counted = 0;

      for (let page = 1; page <= first.json.pages; page += 1) {
        const { json } = await get(
          `/patients?sex=Male&page=${page}&limit=100`,
          clinician.token
        );
        assert.ok(json.patients.every((row) => row.sex === 'Male'), 'every page respects it');
        counted += json.patients.length;
      }

      assert.equal(counted, first.json.total, 'the reported total is the whole filtered set');
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
      const details = newPatient();
      const created = await post('/patients', admin.token, details);
      const id = created.json.patient.id;

      // Asked for by name rather than by counting the directory. Other test
      // files add and remove patients in parallel, so a total read before and
      // after legitimately moves by more than this one deletion.
      const findMe = async () => {
        const { json } = await get(
          `/patients?search=${encodeURIComponent(details.name)}&limit=100`,
          clinician.token
        );
        return json.patients.some((row) => row.id === id);
      };

      assert.equal(await findMe(), true, 'in the directory to begin with');

      assert.equal((await del(`/patients/${id}`, clinician.token)).status, 403, 'clinicians cannot delete');
      assert.equal((await del(`/patients/${id}`, admin.token)).status, 200);

      assert.equal(await findMe(), false, 'gone from the directory');
      assert.equal((await get(`/patients/${id}`, clinician.token)).status, 404);
    });
  });

  // A patient could not correct so much as a phone number: every route onto
  // their own record was an administrator's. What they may change is how the
  // clinic reaches them; what identifies them at reception, and everything
  // clinical, stays with staff.
  describe('a patient putting their own details right', () => {
    let patient;
    let mineId;
    let original;

    before(async () => {
      patient = await login(SEEDED.patient);
      mineId = await patientIdFor(clinician.token, 'Elias Tobias');
      original = (await get(`/patients/${mineId}`, patient.token)).json.patient;
    });

    const restore = () =>
      put(`/patients/${mineId}/contact-details`, patient.token, {
        phone: original.phone,
        address: original.address,
      });

    it('changes their phone and address', async () => {
      const { status, json } = await put(`/patients/${mineId}/contact-details`, patient.token, {
        phone: '9025550123',
        address: '17 Barrington Street, Halifax',
      });

      assert.equal(status, 200);
      assert.equal(json.patient.phone, '9025550123');
      assert.equal(json.patient.address, '17 Barrington Street, Halifax');

      await restore();
    });

    // The endpoint never reads these from the body, so sending them is not
    // rejected - it simply has no effect. That is the point: there is no
    // whitelist here to fall out of step with the fields on the model.
    it('ignores clinical and identifying fields sent alongside', async () => {
      const { status, json } = await put(`/patients/${mineId}/contact-details`, patient.token, {
        phone: '9025550124',
        name: 'Someone Else',
        healthCardNumber: 'FORGED-0001',
        dateOfBirth: '1900-01-01',
        medicalHistory: ['Invented condition'],
      });

      assert.equal(status, 200);
      assert.equal(json.patient.name, original.name);
      assert.equal(json.patient.healthCardNumber, original.healthCardNumber);
      assert.equal(json.patient.dateOfBirth, original.dateOfBirth);
      assert.deepEqual(json.patient.medicalHistory, original.medicalHistory);

      await restore();
    });

    it("cannot reach the administrator's wider update at all", async () => {
      const { status } = await put(`/patients/${mineId}`, patient.token, {
        healthCardNumber: 'FORGED-0002',
      });
      assert.equal(status, 403, 'refused by role, not filtered by field');
    });

    it("cannot touch another patient's details", async () => {
      const otherId = await patientIdFor(clinician.token, 'Sam Smith');
      const { status } = await put(`/patients/${otherId}/contact-details`, patient.token, {
        phone: '9025550999',
      });
      assert.equal(status, 403);
    });

    it('is a patient\'s own route, not one staff use', async () => {
      const { status } = await put(`/patients/${mineId}/contact-details`, admin.token, {
        phone: '9025550125',
      });
      assert.equal(status, 403, 'staff have the fuller update instead');
    });

    it('refuses a change that changes nothing', async () => {
      const { status } = await put(`/patients/${mineId}/contact-details`, patient.token, {});
      assert.equal(status, 400);
    });

    it('still requires signing in', async () => {
      const { status } = await put(`/patients/${mineId}/contact-details`, null, {
        phone: '9025550126',
      });
      assert.equal(status, 401);
    });
  });
});
