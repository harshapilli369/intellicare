const { Op } = require('sequelize');

const { Appointment, Patient, User } = require('../models/mysql');
const AISummary = require('../models/mongodb/AISummary');

const WITH_NAMES = [
  { model: Patient, include: { model: User, attributes: ['name'] } },
  { model: User, as: 'clinician', attributes: ['name'] },
];

const shape = (appointment) => ({
  id: appointment.id,
  patientId: appointment.patientId,
  scheduledAt: appointment.scheduledAt,
  status: appointment.status,
  reason: appointment.reason,
  patientName: appointment.Patient?.User?.name,
  clinicianName: appointment.clinician?.name,
});

const asDate = (date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');

// Everything the clinician's landing screen shows, in one request: their day,
// the counts across the top, what is next, and which days of the month have
// anything on them. Assembling it here keeps the screen from making four
// separate round trips and then reconciling them.
const clinicianDashboard = async (req, res, next) => {
  try {
    const clinicianId = req.user.id;

    const now = new Date();
    const [year, month] = (req.query.month || asDate(now).slice(0, 7)).split('-').map(Number);

    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

    const [today, monthAppointments, upcoming, mine] = await Promise.all([
      Appointment.findAll({
        where: { clinicianId, scheduledAt: { [Op.between]: [dayStart, dayEnd] } },
        include: WITH_NAMES,
        order: [['scheduledAt', 'ASC']],
      }),
      Appointment.findAll({
        where: {
          clinicianId,
          status: { [Op.ne]: 'cancelled' },
          scheduledAt: { [Op.between]: [monthStart, monthEnd] },
        },
        attributes: ['scheduledAt'],
      }),
      Appointment.findOne({
        where: { clinicianId, status: 'scheduled', scheduledAt: { [Op.gt]: now } },
        include: WITH_NAMES,
        order: [['scheduledAt', 'ASC']],
      }),
      // The clinician's own appointments are what scopes the summary counts;
      // AI summaries are keyed on the appointment, not on a clinician.
      Appointment.findAll({ where: { clinicianId }, attributes: ['id', 'status'] }),
    ]);

    const myIds = mine.map((appointment) => appointment.id);
    const completedIds = mine
      .filter((appointment) => appointment.status === 'completed')
      .map((appointment) => appointment.id);

    const [writeupsToApprove, summarised] = await Promise.all([
      // Written by the model, not yet released by the clinician.
      AISummary.countDocuments({ appointmentId: { $in: myIds }, finalized: false }),
      AISummary.find({ appointmentId: { $in: completedIds } }).distinct('appointmentId'),
    ]);

    // A visit that has happened and has nothing written about it at all.
    const pendingReports = completedIds.filter((id) => !summarised.includes(id)).length;

    res.json({
      success: true,
      counts: {
        appointmentsToday: today.filter((a) => a.status !== 'cancelled').length,
        writeupsToApprove,
        pendingReports,
      },
      today: today.map(shape),
      upcoming: upcoming ? shape(upcoming) : null,
      // Days of the requested month that have something on them, so the
      // calendar can mark them without shipping every appointment.
      busyDays: [
        ...new Set(monthAppointments.map((a) => new Date(a.scheduledAt).getDate())),
      ].sort((a, b) => a - b),
      month: `${year}-${String(month).padStart(2, '0')}`,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { clinicianDashboard };
