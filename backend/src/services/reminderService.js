const { Op } = require('sequelize');

const { Appointment, Patient, User } = require('../models/mysql');
const ReminderDispatch = require('../models/mongodb/ReminderDispatch');
const ReminderPreference = require('../models/mongodb/ReminderPreference');
const { sendMail } = require('./emailService');
const { notify } = require('./notificationService');
const { formatWhen } = require('../utils/datetime');

// How far ahead of a visit each reminder goes out, largest first so a patient
// booking inside the shorter horizon still gets that reminder and not the one
// that has already passed.
const offsets = () =>
  (process.env.REMINDER_OFFSETS_HOURS || '24,1')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b - a);

const messageFor = (appointment, offsetHours) => {
  const when = formatWhen(appointment.scheduledAt);
  const lead = offsetHours >= 24 ? `in ${Math.round(offsetHours / 24)} day(s)` : `in about ${offsetHours} hour(s)`;

  return {
    subject: `Reminder: your appointment ${lead}`,
    text: [
      `Hello ${appointment.Patient?.User?.name || 'there'},`,
      '',
      `This is a reminder of your appointment with ${appointment.clinician?.name} ${lead}.`,
      '',
      `When: ${when}`,
      appointment.reason ? `Reason: ${appointment.reason}` : null,
      '',
      'If you can no longer attend, please cancel or reschedule through IntelliCare.',
    ]
      .filter((line) => line !== null)
      .join('\n'),
  };
};

// Appointments that have entered a given reminder horizon and have not yet
// happened. Framing it as "inside the horizon" rather than "due in the next few
// minutes" means a scan that is late, or one that was missed entirely, still
// sends the reminder instead of skipping it.
const findWithinHorizon = async (offsetHours, now = new Date()) => {
  const horizon = new Date(now.getTime() + offsetHours * 3_600_000);

  return Appointment.findAll({
    where: {
      status: 'scheduled',
      scheduledAt: { [Op.gt]: now, [Op.lte]: horizon },
    },
    include: [
      { model: Patient, include: { model: User, attributes: ['name', 'email'] } },
      { model: User, as: 'clinician', attributes: ['name'] },
    ],
    order: [['scheduledAt', 'ASC']],
  });
};

// Sends one reminder, claiming it first. The unique index on
// (appointmentId, offsetHours) is what makes this safe to call repeatedly: a
// second attempt loses the race to insert and is reported as a duplicate rather
// than mailing the patient twice.
const dispatchOne = async (appointment, offsetHours, channels = { email: true, inApp: true }) => {
  const to = channels.email ? appointment.Patient?.User?.email || null : null;

  let claim;
  try {
    claim = await ReminderDispatch.create({
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      offsetHours,
      to,
      status: 'sent',
    });
  } catch (err) {
    if (err.code === 11000) return { outcome: 'duplicate' };
    throw err;
  }

  const { subject, text } = messageFor(appointment, offsetHours);

  // The reminder is raised in the application as well as sent by mail. It is
  // claimed by the same dispatch record, so it appears once however many times
  // the scan runs, and it still appears when there is no mail configured or
  // when sending fails.
  if (channels.inApp) {
    await notify({
      userId: appointment.Patient?.userId,
      kind: 'appointment-reminder',
      title: subject,
      body: text,
      link: '/patient',
    });
  }

  // With mail turned off for this patient there is no address to send to, and
  // `sendMail` reports that as a skip - which is the honest record of what
  // happened rather than a failure.
  const result = await sendMail({ to, subject, text });

  claim.status = result.status;
  claim.detail = result.detail;
  await claim.save();

  return { outcome: result.status };
};

// What one patient has asked for, or the clinic's own schedule when they have
// asked for nothing. An empty list of offsets is a patient saying "do not
// remind me" and is honoured as such - which is why it cannot simply fall
// through to the default the way an absent preference does.
const scheduleFor = (preference) => {
  if (!preference) return { offsets: offsets(), email: true, inApp: true };

  return {
    offsets: Array.isArray(preference.offsetsHours) ? preference.offsetsHours : offsets(),
    email: preference.email !== false,
    inApp: preference.inApp !== false,
  };
};

// One pass. Every patient may be on a different schedule now, so the scan reads
// the widest horizon anyone is asking for, then decides per appointment which
// of that patient's offsets it has entered.
//
// Returns a tally rather than logging only, so the job and the tests can both
// see what happened.
const dispatchDue = async (now = new Date()) => {
  const tally = { sent: 0, skipped: 0, failed: 0, duplicate: 0 };

  const preferences = await ReminderPreference.find({});
  const byPatient = new Map(preferences.map((p) => [p.patientId, p]));

  // Far enough ahead to cover the clinic's own schedule and anyone who has
  // asked to be told earlier than that.
  const widest = Math.max(
    ...offsets(),
    ...preferences.flatMap((p) => (Array.isArray(p.offsetsHours) ? p.offsetsHours : [])),
    0
  );
  if (widest === 0) return tally;

  const upcoming = await findWithinHorizon(widest, now);

  for (const appointment of upcoming) {
    const { offsets: wanted, email, inApp } = scheduleFor(byPatient.get(appointment.patientId));

    for (const offsetHours of wanted) {
      // Inside this particular offset's horizon, rather than merely inside the
      // widest one - otherwise everybody would be reminded at the earliest
      // time anyone had asked for.
      const horizon = new Date(now.getTime() + offsetHours * 3_600_000);
      if (appointment.scheduledAt > horizon) continue;

      const { outcome } = await dispatchOne(appointment, offsetHours, { email, inApp });
      tally[outcome] = (tally[outcome] || 0) + 1;
    }
  }

  return tally;
};

module.exports = {
  offsets,
  scheduleFor,
  dispatchDue,
  findWithinHorizon,
  messageFor,
};
