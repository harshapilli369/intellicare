const { Op } = require('sequelize');

const { Appointment, Patient, User } = require('../models/mysql');
const ReminderDispatch = require('../models/mongodb/ReminderDispatch');
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
const dispatchOne = async (appointment, offsetHours) => {
  const to = appointment.Patient?.User?.email || null;

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
  await notify({
    userId: appointment.Patient?.userId,
    kind: 'appointment-reminder',
    title: subject,
    body: text,
    link: '/patient',
  });

  const result = await sendMail({ to, subject, text });

  claim.status = result.status;
  claim.detail = result.detail;
  await claim.save();

  return { outcome: result.status };
};

// One pass over every configured offset. Returns a tally rather than logging
// only, so the job and the tests can both see what happened.
const dispatchDue = async (now = new Date()) => {
  const tally = { sent: 0, skipped: 0, failed: 0, duplicate: 0 };

  for (const offsetHours of offsets()) {
    const due = await findWithinHorizon(offsetHours, now);

    for (const appointment of due) {
      const { outcome } = await dispatchOne(appointment, offsetHours);
      tally[outcome] = (tally[outcome] || 0) + 1;
    }
  }

  return tally;
};

module.exports = { offsets, dispatchDue, findWithinHorizon, messageFor };
