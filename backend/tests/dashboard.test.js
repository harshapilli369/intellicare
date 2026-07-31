const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

const { SEEDED, get, login, requireRunningApi, daysFromNow } = require('./helpers');

describe('Clinician dashboard', () => {
  let clinician;
  let admin;
  let patient;
  let dashboard;

  before(async () => {
    await requireRunningApi();
    clinician = await login(SEEDED.clinician);
    admin = await login(SEEDED.admin);
    patient = await login(SEEDED.patient);

    dashboard = (await get('/dashboard/clinician', clinician.token)).json;
  });

  it('is clinician only', async () => {
    assert.equal((await get('/dashboard/clinician', admin.token)).status, 403);
    assert.equal((await get('/dashboard/clinician', patient.token)).status, 403);
    assert.equal((await get('/dashboard/clinician', null)).status, 401);
  });

  it('returns everything the screen renders', async () => {
    assert.equal(typeof dashboard.counts.appointmentsToday, 'number');
    assert.equal(typeof dashboard.counts.writeupsToApprove, 'number');
    assert.equal(typeof dashboard.counts.pendingReports, 'number');
    assert.ok(Array.isArray(dashboard.today));
    assert.ok(Array.isArray(dashboard.busyDays));
    assert.ok('upcoming' in dashboard);
  });

  it("today's list carries what each row shows, in time order", () => {
    assert.ok(dashboard.today.every((a) => !!a.patientName), 'a name');
    assert.ok(dashboard.today.every((a) => !!a.patientId), 'a patient to open');
    assert.ok(dashboard.today.every((a) => !!a.scheduledAt), 'a time');

    const times = dashboard.today.map((a) => new Date(a.scheduledAt).getTime());
    assert.deepEqual(times, [...times].sort((a, b) => a - b));
  });

  it('counts today against the list it returns', () => {
    const active = dashboard.today.filter((a) => a.status !== 'cancelled').length;
    assert.equal(dashboard.counts.appointmentsToday, active);
  });

  it('the upcoming appointment is in the future and still scheduled', () => {
    if (!dashboard.upcoming) return;
    assert.equal(dashboard.upcoming.status, 'scheduled');
    assert.ok(new Date(dashboard.upcoming.scheduledAt).getTime() > Date.now());
    assert.ok(dashboard.upcoming.patientName);
  });

  it('marks the days of the month that have appointments', async () => {
    assert.ok(dashboard.busyDays.every((day) => Number.isInteger(day) && day >= 1 && day <= 31));

    // The seed books visits today, so today's date must be marked.
    const today = new Date().getDate();
    assert.ok(dashboard.busyDays.includes(today), "today is marked when today has visits");
  });

  it('answers for another month without complaint', async () => {
    const { status, json } = await get('/dashboard/clinician?month=2020-01', clinician.token);
    assert.equal(status, 200);
    assert.equal(json.month, '2020-01');
    assert.deepEqual(json.busyDays, [], 'a month with nothing in it is simply empty');
  });

  it('rejects a malformed month', async () => {
    assert.equal((await get('/dashboard/clinician?month=nonsense', clinician.token)).status, 400);
  });

  it('shows only this clinician\'s day', async () => {
    const mine = await get(
      `/appointments?clinicianId=${clinician.user.id}&from=${daysFromNow(0)}&to=${daysFromNow(0)}`,
      clinician.token
    );
    const ids = mine.json.appointments.map((a) => a.id).sort();
    assert.deepEqual(dashboard.today.map((a) => a.id).sort(), ids);
  });
});
