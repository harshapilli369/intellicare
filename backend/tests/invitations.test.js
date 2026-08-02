const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

const { BASE, SEEDED, get, post, login, requireRunningApi } = require('./helpers');

// Importing a patient used to invent a password for them and print it on the
// report - once, with nothing to send it and nowhere to get it back from. It
// now issues an invitation instead: a single-use link, expiring, that lets the
// patient set their own password and lets an administrator issue another
// whenever one is needed.
describe('Invitations for imported patients', () => {
  let admin;
  let patient;

  // The import endpoint takes a file, which the shared helpers do not do.
  const importCsv = async (csv, token) => {
    const form = new FormData();
    form.append('file', new Blob([csv], { type: 'text/csv' }), 'patients.csv');

    const response = await fetch(`${BASE}/patients/import`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    return { status: response.status, json: await response.json() };
  };

  const importOne = async (overrides = {}) => {
    const email = `invited.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;
    const row = { name: 'Invited Patient', email, ...overrides };

    const header = Object.keys(row).join(',');
    const values = Object.values(row).join(',');
    const { json } = await importCsv(`${header}\n${values}\n`, admin.token);

    return { email, row: json.results[0] };
  };

  const tokenFrom = (invitation) => invitation.link.split('/invite/')[1];

  before(async () => {
    await requireRunningApi();
    admin = await login(SEEDED.admin);
    patient = await login(SEEDED.patient);
  });

  // Proposal 5.7 asks for import to "add new patients or update existing
  // demographic and historical records in bulk". Only the first half worked -
  // a row whose email was already on file was refused, so re-importing a
  // corrected export changed nothing at all.
  describe('bringing existing patients up to date', () => {
    const read = async (id) => (await get(`/patients/${id}`, admin.token)).json.patient;

    it('updates a patient already on the books rather than refusing them', async () => {
      const { email, row } = await importOne({
        phone: '9025550100',
        address: '1 Old Street',
        sex: 'Female',
      });
      const before = await read(row.patientId);

      const { json } = await importCsv(
        `name,email,phone,address\nAda Lovelace,${email},9025559999,42 New Road\n`,
        admin.token
      );
      const again = json.results[0];

      assert.equal(again.status, 'updated');
      assert.equal(json.updated, 1);
      assert.equal(json.rejected, 0);
      assert.deepEqual([...again.changed].sort(), ['address', 'name', 'phone']);

      const after = await read(row.patientId);
      assert.equal(after.phone, '9025559999');
      assert.equal(after.address, '42 New Road');
      assert.equal(after.sex, before.sex, 'a column the file left out is not blanked');
    });

    // A file exported with three columns, corrected, and sent back must not
    // erase everything it did not mention.
    it('leaves out what the file leaves out', async () => {
      const { email, row } = await importOne({
        medicalHistory: 'Asthma',
        allergies: 'Penicillin',
      });
      const before = await read(row.patientId);

      await importCsv(`name,email,phone\nAda Lovelace,${email},9025551234\n`, admin.token);
      const after = await read(row.patientId);

      assert.deepEqual(after.medicalHistory, before.medicalHistory);
      assert.deepEqual(after.allergies, before.allergies);
    });

    // A password belongs to the patient once they have set one. An
    // administrator re-importing a spreadsheet must not overwrite it.
    it('never touches a password on an update', async () => {
      const { email } = await importOne({ password: 'TheirOwnPassword1!' });

      await importCsv(`name,email,phone\nAda Lovelace,${email},9025554321\n`, admin.token);

      const { status } = await post('/auth/login', null, {
        email,
        password: 'TheirOwnPassword1!',
      });
      assert.equal(status, 200, 'they can still sign in with the password they had');
    });

    it('refuses a row naming a staff account', async () => {
      const { json } = await importCsv(
        `name,email,phone\nNot A Patient,${SEEDED.admin},9025550000\n`,
        admin.token
      );

      assert.equal(json.results[0].status, 'rejected');
      assert.match(json.results[0].errors[0].message, /staff account/);
    });

    it('still refuses the same address twice in one file', async () => {
      const email = `dup.${Date.now()}@example.com`;
      const { json } = await importCsv(`name,email\nOne,${email}\nTwo,${email}\n`, admin.token);

      assert.equal(json.results[1].status, 'rejected');
      assert.match(json.results[1].errors[0].message, /Duplicate of line 1/);
    });

    it('adds, updates and rejects within one file, and the totals add up', async () => {
      const { email } = await importOne();
      const fresh = `fresh.${Date.now()}@example.com`;

      const { json } = await importCsv(
        `name,email,phone\n` +
          `Ada Lovelace,${email},9025551111\n` +
          `Brand New,${fresh},9025552222\n` +
          `Bad Row,not-an-email,9025553333\n`,
        admin.token
      );

      assert.equal(json.updated, 1);
      assert.equal(json.inserted, 1);
      assert.equal(json.rejected, 1);
      assert.equal(json.inserted + json.updated + json.rejected, json.totalRows);
    });
  });

  describe('what an import produces', () => {
    it('issues an invitation instead of inventing a password', async () => {
      const { row } = await importOne();

      assert.equal(row.status, 'inserted');
      assert.equal(row.temporaryPassword, undefined, 'no password is handed back');
      assert.ok(row.invitation?.link, 'an invitation is issued');
      assert.ok(new Date(row.invitation.expiresAt) > new Date(), 'and it has not already expired');
    });

    it('leaves the account unusable until the patient sets a password', async () => {
      const { email } = await importOne();

      // The generated secret is never revealed, so the only way in is the link.
      const { status } = await post('/auth/login', null, { email, password: 'Password123!' });
      assert.equal(status, 401);
    });

    it('does not invite a row that brought its own password', async () => {
      const { email, row } = await importOne({ password: 'TheirOwnPassword1!' });

      assert.equal(row.invitation, null, 'nothing to invite them to');
      const { status } = await post('/auth/login', null, {
        email,
        password: 'TheirOwnPassword1!',
      });
      assert.equal(status, 200, 'they can sign in with what the file gave them');
    });
  });

  describe('following the link', () => {
    it('names the patient it belongs to', async () => {
      const { row } = await importOne();
      const { status, json } = await get(`/auth/invite/${tokenFrom(row.invitation)}`, null);

      assert.equal(status, 200);
      assert.equal(json.invitation.name, 'Invited Patient');
    });

    it('sets the password and signs the patient in', async () => {
      const { email, row } = await importOne();

      const { status, json } = await post(
        `/auth/invite/${tokenFrom(row.invitation)}`,
        null,
        { password: 'ChosenByMe123!' }
      );

      assert.equal(status, 200);
      assert.equal(json.user.role, 'patient');
      assert.ok(json.token, 'signed in, rather than sent round to the login form');

      const after = await post('/auth/login', null, { email, password: 'ChosenByMe123!' });
      assert.equal(after.status, 200, 'and the chosen password works from then on');
    });

    it('cannot be followed twice', async () => {
      const { row } = await importOne();
      const token = tokenFrom(row.invitation);

      assert.equal((await post(`/auth/invite/${token}`, null, { password: 'First123!' })).status, 200);
      assert.equal(
        (await post(`/auth/invite/${token}`, null, { password: 'Second123!' })).status,
        404,
        'a link that has been used is gone'
      );
    });

    it('refuses a token that was never real, without saying so', async () => {
      const invented = 'a'.repeat(64);
      const { status } = await get(`/auth/invite/${invented}`, null);

      // The same answer a spent or expired one gets, so feeding in guesses
      // reveals nothing about which have ever existed.
      assert.equal(status, 404);
    });

    it('refuses a token of the wrong shape before looking it up', async () => {
      assert.equal((await get('/auth/invite/tooshort', null)).status, 400);
      assert.equal((await get(`/auth/invite/${'z'.repeat(64)}`, null)).status, 400, 'not hex');
    });

    it('refuses a password too short to be worth having', async () => {
      const { row } = await importOne();
      const { status } = await post(`/auth/invite/${tokenFrom(row.invitation)}`, null, {
        password: 'short',
      });
      assert.equal(status, 400);
    });
  });

  describe('issuing another', () => {
    it('lets an administrator send a fresh one at any time', async () => {
      const { row } = await importOne();

      const { status, json } = await post(`/patients/${row.patientId}/invitation`, admin.token);
      assert.equal(status, 200);
      assert.notEqual(json.invitation.link, row.invitation.link, 'a new link, not the old one');
    });

    // This is what makes the import report disposable: whatever was on it can
    // always be had again, so nothing has to be copied down before leaving.
    it('retires the previous link when a new one is issued', async () => {
      const { row } = await importOne();
      const first = tokenFrom(row.invitation);

      await post(`/patients/${row.patientId}/invitation`, admin.token);

      assert.equal(
        (await get(`/auth/invite/${first}`, null)).status,
        404,
        'the link that went astray no longer opens anything'
      );
    });

    it('is an administrator\'s privilege alone', async () => {
      const { row } = await importOne();

      assert.equal((await post(`/patients/${row.patientId}/invitation`, patient.token)).status, 403);
      assert.equal((await post(`/patients/${row.patientId}/invitation`, null)).status, 401);
    });

    it('answers 404 for a patient who does not exist', async () => {
      assert.equal((await post('/patients/999999/invitation', admin.token)).status, 404);
    });
  });
});
