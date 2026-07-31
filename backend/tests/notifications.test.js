const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const { connectMySQL, sequelize } = require('../src/config/mysql');
const { connectMongoDB } = require('../src/config/mongodb');
const { Appointment, Patient, User } = require('../src/models/mysql');
const Notification = require('../src/models/mongodb/Notification');
const ReminderDispatch = require('../src/models/mongodb/ReminderDispatch');
const { dispatchDue } = require('../src/services/reminderService');

const { SEEDED, get, patch, login, requireRunningApi } = require('./helpers');

describe('In-app notifications', () => {
  let patient;
  let clinician;
  let profile;
  let created = [];
  let smtpHost;

  before(async () => {
    // The reminder path is driven directly here, so mail stays switched off.
    smtpHost = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;

    await requireRunningApi();
    await connectMySQL();
    await connectMongoDB();

    patient = await login(SEEDED.patient);
    clinician = await login(SEEDED.clinician);
    profile = await Patient.findOne({ where: { userId: patient.user.id } });
  });

  after(async () => {
    if (smtpHost !== undefined) process.env.SMTP_HOST = smtpHost;

    const ids = created.map((appointment) => appointment.id);
    if (ids.length) {
      await ReminderDispatch.deleteMany({ appointmentId: { $in: ids } });
      await Appointment.destroy({ where: { id: ids } });
    }
    await Notification.deleteMany({ userId: patient.user.id, kind: 'test-only' });

    await sequelize.close();
    await mongoose.disconnect();
  });

  const raise = (overrides = {}) =>
    Notification.create({
      userId: patient.user.id,
      kind: 'test-only',
      title: 'A message for the patient',
      ...overrides,
    });

  it('lists a user their own notifications, newest first, with an unread count', async () => {
    await raise({ title: 'Older' });
    await raise({ title: 'Newer' });

    const { status, json } = await get('/notifications', patient.token);
    assert.equal(status, 200);
    assert.ok(json.notifications.length >= 2);
    assert.ok(json.unread >= 2);

    const times = json.notifications.map((n) => new Date(n.createdAt).getTime());
    assert.deepEqual(times, [...times].sort((a, b) => b - a), 'newest first');
  });

  it('never shows one account the notifications of another', async () => {
    const mine = await raise({ title: 'Only for the patient' });

    const { json } = await get('/notifications', clinician.token);
    assert.ok(
      !json.notifications.some((n) => n.id === String(mine._id)),
      "a clinician does not see a patient's notification"
    );
  });

  it('marks one read, and the count follows', async () => {
    const raised = await raise({ title: 'To be read' });

    const before = (await get('/notifications', patient.token)).json.unread;
    const { status, json } = await patch(`/notifications/${raised._id}/read`, patient.token);

    assert.equal(status, 200);
    assert.equal(json.notification.read, true);
    assert.equal(json.unread, before - 1);
  });

  it('marking read twice is harmless', async () => {
    const raised = await raise({ title: 'Read me twice' });

    await patch(`/notifications/${raised._id}/read`, patient.token);
    const countAfterFirst = (await get('/notifications', patient.token)).json.unread;

    const second = await patch(`/notifications/${raised._id}/read`, patient.token);
    assert.equal(second.status, 200);
    assert.equal(second.json.unread, countAfterFirst, 'the count does not move again');
  });

  it("refuses to mark another account's notification read", async () => {
    const mine = await raise({ title: 'Not yours' });
    const { status } = await patch(`/notifications/${mine._id}/read`, clinician.token);
    assert.equal(status, 404, 'reported as not found rather than confirming it exists');
  });

  it('rejects a malformed id', async () => {
    assert.equal((await patch('/notifications/not-an-id/read', patient.token)).status, 400);
  });

  it('marks everything read at once', async () => {
    await raise({ title: 'One' });
    await raise({ title: 'Two' });

    const { status, json } = await patch('/notifications/read-all', patient.token);
    assert.equal(status, 200);
    assert.equal(json.unread, 0);

    const after = await get('/notifications', patient.token);
    assert.equal(after.json.unread, 0);
    assert.ok(after.json.notifications.every((n) => n.read));
  });

  it('filters to unread only when asked', async () => {
    await patch('/notifications/read-all', patient.token);
    await raise({ title: 'Fresh' });

    const { json } = await get('/notifications?unread=true', patient.token);
    assert.ok(json.notifications.length > 0);
    assert.ok(json.notifications.every((n) => !n.read));
  });

  it('raises a reminder in the app, once, alongside the email', async () => {
    const appointment = await Appointment.create({
      patientId: profile.id,
      clinicianId: clinician.user.id,
      scheduledAt: new Date(Date.now() + 20 * 3_600_000),
      reason: 'Notification test',
      status: 'scheduled',
    });
    created.push(appointment);

    await dispatchDue();
    const first = await Notification.find({
      userId: patient.user.id,
      kind: 'appointment-reminder',
    });
    assert.ok(first.length > 0, 'the reminder appears in the app');

    // The scan runs repeatedly; the dispatch record is what stops it repeating.
    await dispatchDue();
    await dispatchDue();
    const afterRepeats = await Notification.find({
      userId: patient.user.id,
      kind: 'appointment-reminder',
    });
    assert.equal(afterRepeats.length, first.length, 'and does not pile up');

    // and the patient can read it and clear it, which is the whole point
    const listed = await get('/notifications', patient.token);
    const reminder = listed.json.notifications.find((n) => n.kind === 'appointment-reminder');
    assert.ok(reminder, 'it is visible to the patient');

    const read = await patch(`/notifications/${reminder.id}/read`, patient.token);
    assert.equal(read.json.notification.read, true);

    await Notification.deleteMany({ userId: patient.user.id, kind: 'appointment-reminder' });
  });
});
