// The reminder engine is exercised directly rather than over HTTP: it has no
// endpoint, and driving it in process is what lets the clock be moved to put an
// appointment inside a reminder horizon.
const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { connectMySQL, sequelize } = require('../src/config/mysql');
const { connectMongoDB } = require('../src/config/mongodb');
const mongoose = require('mongoose');

const { Appointment, Patient, User } = require('../src/models/mysql');
const ReminderDispatch = require('../src/models/mongodb/ReminderDispatch');
const { dispatchDue, findWithinHorizon, messageFor, offsets } = require('../src/services/reminderService');
const { silenceMail } = require('./helpers');

const hours = (n) => n * 3_600_000;

describe('Appointment reminders', () => {
  let clinician;
  let patient;
  let created = [];
  let restoreMail;

  before(async () => {
    // Mail is switched off for the duration: these tests drive the dispatcher
    // directly, and a developer with working credentials should not have the
    // suite send messages to the seeded addresses.
    restoreMail = silenceMail();

    await connectMySQL();
    await connectMongoDB();

    clinician = await User.findOne({ where: { role: 'clinician' } });
    patient = await Patient.findOne({ include: { model: User } });

    assert.ok(clinician && patient, 'the database needs to be seeded first');
  });

  after(async () => {
    restoreMail();
    await sequelize.close();
    await mongoose.disconnect();
  });

  beforeEach(() => {
    created = [];
  });

  // Each test cleans up after itself, so the suite can be run repeatedly against
  // the same database without appointments or dispatch records piling up.
  afterEach(async () => {
    if (created.length === 0) return;
    const ids = created.map((appointment) => appointment.id);
    await ReminderDispatch.deleteMany({ appointmentId: { $in: ids } });
    await Appointment.destroy({ where: { id: ids } });
  });

  // An appointment a given number of hours from now, cleaned up afterwards.
  const appointmentIn = async (hoursAhead) => {
    const appointment = await Appointment.create({
      patientId: patient.id,
      clinicianId: clinician.id,
      scheduledAt: new Date(Date.now() + hours(hoursAhead)),
      reason: 'Reminder test',
      status: 'scheduled',
    });
    created.push(appointment);
    return appointment;
  };

  const dispatchesFor = (appointment) => ReminderDispatch.find({ appointmentId: appointment.id });

  it('reads its offsets from configuration, longest first', () => {
    const configured = offsets();
    assert.ok(configured.length > 0);
    assert.deepEqual(configured, [...configured].sort((a, b) => b - a));
  });

  it('finds an appointment once it is inside the horizon', async () => {
    const soon = await appointmentIn(20);

    const withinDay = await findWithinHorizon(24);
    assert.ok(withinDay.some((a) => a.id === soon.id), '20h away is inside the 24h horizon');

    const withinHour = await findWithinHorizon(1);
    assert.ok(!withinHour.some((a) => a.id === soon.id), 'but not inside the 1h horizon');
  });

  it('ignores an appointment beyond every horizon', async () => {
    const distant = await appointmentIn(80);
    const withinDay = await findWithinHorizon(24);
    assert.ok(!withinDay.some((a) => a.id === distant.id));
  });

  it('ignores an appointment that has already passed', async () => {
    const past = await appointmentIn(-5);
    const withinDay = await findWithinHorizon(24);
    assert.ok(!withinDay.some((a) => a.id === past.id));
  });

  it('ignores a cancelled appointment', async () => {
    const cancelled = await appointmentIn(20);
    await cancelled.update({ status: 'cancelled' });

    const withinDay = await findWithinHorizon(24);
    assert.ok(!withinDay.some((a) => a.id === cancelled.id));
  });

  it('records one dispatch per offset for an appointment', async () => {
    const soon = await appointmentIn(20);
    await dispatchDue();

    const records = await dispatchesFor(soon);
    assert.equal(records.length, 1, 'only the 24h reminder applies at 20h out');
    assert.equal(records[0].offsetHours, 24);
    assert.equal(records[0].appointmentId, soon.id);
    assert.equal(records[0].patientId, soon.patientId);
    assert.equal(records[0].to, patient.User.email, 'addressed to the patient on file');
  });

  it('does not send the same reminder twice, however often it runs', async () => {
    const soon = await appointmentIn(20);

    await dispatchDue();
    const first = await dispatchesFor(soon);

    await dispatchDue();
    await dispatchDue();
    const afterRepeats = await dispatchesFor(soon);

    assert.equal(afterRepeats.length, first.length, 'repeat scans add nothing');
    const second = await dispatchDue();
    assert.equal(second.sent, 0, 'and report no fresh sends for it');
  });

  it('sends both reminders as an appointment crosses each horizon', async () => {
    const soon = await appointmentIn(0.5);
    await dispatchDue();

    const records = await dispatchesFor(soon);
    const sentOffsets = records.map((r) => r.offsetHours).sort((a, b) => b - a);
    assert.deepEqual(sentOffsets, [24, 1], 'inside both horizons, both go out');
  });

  it('records why a reminder did not go out rather than failing the scan', async () => {
    // Mail is switched off for this suite, so every dispatch should be recorded
    // as skipped with the reason attached, and the scan should still complete.
    const soon = await appointmentIn(20);
    const tally = await dispatchDue();

    assert.ok(tally, 'the scan completes');

    const records = await dispatchesFor(soon);
    assert.equal(records.length, 1);
    assert.equal(records[0].status, 'skipped');
    assert.equal(records[0].detail, 'no mail provider configured');
  });

  it('writes a message naming the visit', async () => {
    const soon = await appointmentIn(20);
    const [loaded] = await findWithinHorizon(24);
    const appointment = (await findWithinHorizon(24)).find((a) => a.id === soon.id) || loaded;

    const { subject, text } = messageFor(appointment, 24);
    assert.match(subject, /Reminder/i);
    assert.match(text, /appointment/i);
    assert.ok(text.includes(appointment.clinician.name), 'names the clinician');
  });
});
