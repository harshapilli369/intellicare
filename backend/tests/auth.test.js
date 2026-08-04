const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

const { SEEDED, PASSWORD, get, post, login, requireRunningApi, unique } = require('./helpers');

describe('Authentication and roles', () => {
  let clinician;
  let admin;

  before(async () => {
    await requireRunningApi();
    clinician = await login(SEEDED.clinician);
    admin = await login(SEEDED.admin);
  });

  it('signs in a seeded account of each role', async () => {
    assert.equal(clinician.user.role, 'clinician');
    assert.equal(admin.user.role, 'admin');
    const patient = await login(SEEDED.patient);
    assert.equal(patient.user.role, 'patient');
  });

  it('refuses a wrong password without saying which part was wrong', async () => {
    const { status, json } = await post('/auth/login', null, {
      email: SEEDED.clinician,
      password: 'not-the-password',
    });
    assert.equal(status, 401);
    assert.equal(json.message, 'Invalid credentials');
  });

  it('gives the same answer for an unknown email', async () => {
    const { status, json } = await post('/auth/login', null, {
      email: 'nobody@example.com',
      password: PASSWORD,
    });
    assert.equal(status, 401);
    assert.equal(json.message, 'Invalid credentials');
  });

  it('rejects a malformed sign-in body', async () => {
    const { status } = await post('/auth/login', null, { email: { $ne: null }, password: PASSWORD });
    assert.equal(status, 400);
  });

  it('restores the signed-in account from the token', async () => {
    const { status, json } = await get('/auth/me', clinician.token);
    assert.equal(status, 200);
    assert.equal(json.user.email, SEEDED.clinician);
  });

  it('refuses an unauthenticated request', async () => {
    assert.equal((await get('/patients')).status, 401);
  });

  describe('public sign-up cannot choose a role', () => {
    it('creates a patient even when asked for clinician', async () => {
      const email = `${unique('signup')}@example.com`;
      const { status, json } = await post('/auth/register', null, {
        email,
        password: PASSWORD,
        name: 'Self Signup',
        role: 'clinician',
      });

      assert.equal(status, 201);
      assert.equal(json.user.role, 'patient');
    });

    it('creates a patient even when asked for admin', async () => {
      const email = `${unique('signup')}@example.com`;
      const { json } = await post('/auth/register', null, {
        email,
        password: PASSWORD,
        name: 'Self Signup',
        role: 'admin',
      });

      assert.equal(json.user.role, 'patient');
    });

    it('hands back a token that opens no staff doors', async () => {
      const email = `${unique('signup')}@example.com`;
      const { json } = await post('/auth/register', null, {
        email,
        password: PASSWORD,
        name: 'Self Signup',
        role: 'clinician',
      });

      assert.equal((await get('/patients', json.token)).status, 403);
      assert.equal((await get('/notes/patient/1', json.token)).status, 403);
    });
  });

  describe('staff accounts are created by an administrator', () => {
    const staff = () => ({
      email: `${unique('staff')}@intellicare.ca`,
      password: PASSWORD,
      name: 'New Clinician',
      role: 'clinician',
    });

    it('refuses an unauthenticated caller', async () => {
      assert.equal((await post('/auth/staff', null, staff())).status, 401);
    });

    it('refuses a clinician', async () => {
      assert.equal((await post('/auth/staff', clinician.token, staff())).status, 403);
    });

    it('lets an administrator create a clinician who can then sign in', async () => {
      const account = staff();
      const { status, json } = await post('/auth/staff', admin.token, account);

      assert.equal(status, 201);
      assert.equal(json.user.role, 'clinician');

      const signedIn = await login(account.email);
      assert.equal(signedIn.user.role, 'clinician');
    });

    it('rejects a role that is not staff', async () => {
      const { status } = await post('/auth/staff', admin.token, { ...staff(), role: 'patient' });
      assert.equal(status, 400);
    });
  });
});
