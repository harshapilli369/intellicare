const { Op } = require('sequelize');

const { sequelize } = require('../config/mysql');
const { Appointment, Patient, User } = require('../models/mysql');
const { patientProfileFor } = require('../middleware/ownership');
const { notify } = require('../services/notificationService');
const {
  HOLDS_A_SLOT,
  startOfDay,
  endOfDay,
  slotsForDate,
  isWorkingTime,
  lockClinicianDiary,
  findClash,
  isWithinChangeWindow,
  changeWindowHours,
} = require('../services/schedule');

// Both names travel with the appointment so a schedule can be rendered without
// a lookup per row.
const WITH_NAMES = [
  { model: Patient, include: { model: User, attributes: ['name'] } },
  { model: User, as: 'clinician', attributes: ['name'] },
];

const shape = (appointment) => ({
  id: appointment.id,
  patientId: appointment.patientId,
  clinicianId: appointment.clinicianId,
  scheduledAt: appointment.scheduledAt,
  status: appointment.status,
  reason: appointment.reason,
  patientName: appointment.Patient?.User?.name,
  clinicianName: appointment.clinician?.name,
});

const findClinician = async (clinicianId) => {
  const clinician = await User.findByPk(clinicianId);
  return clinician && clinician.role === 'clinician' ? clinician : null;
};

// Staff act on any appointment; a patient only on their own.
const mayAct = (user, appointment, profile) =>
  user.role !== 'patient' || (profile && appointment.patientId === profile.id);

const list = async (req, res, next) => {
  try {
    const { clinicianId, patientId, status, from, to } = req.query;
    const where = {};

    // A patient sees their own appointments whatever they ask for; the same
    // appointment is otherwise visible to its clinician and to an admin.
    const profile = await patientProfileFor(req.user);
    if (req.user.role === 'patient') {
      if (!profile) return res.json({ success: true, appointments: [] });
      where.patientId = profile.id;
    } else if (patientId) {
      where.patientId = patientId;
    }

    if (clinicianId) where.clinicianId = clinicianId;
    if (status) where.status = status;
    if (from || to) {
      where.scheduledAt = {};
      if (from) where.scheduledAt[Op.gte] = new Date(`${from}T00:00:00`);
      if (to) where.scheduledAt[Op.lte] = new Date(`${to}T23:59:59.999`);
    }

    const appointments = await Appointment.findAll({
      where,
      include: WITH_NAMES,
      order: [['scheduledAt', 'ASC']],
    });

    res.json({ success: true, appointments: appointments.map(shape) });
  } catch (err) {
    next(err);
  }
};

const availability = async (req, res, next) => {
  try {
    const { clinicianId, date } = req.query;

    if (!(await findClinician(clinicianId))) {
      return res.status(404).json({ message: 'Clinician not found' });
    }

    const [year, month, day] = date.split('-').map(Number);
    const booked = await Appointment.findAll({
      where: {
        clinicianId,
        status: HOLDS_A_SLOT,
        scheduledAt: { [Op.between]: [startOfDay(year, month, day), endOfDay(year, month, day)] },
      },
      attributes: ['scheduledAt'],
    });

    const takenAt = new Set(booked.map((a) => new Date(a.scheduledAt).getTime()));
    const now = Date.now();

    // A slot is offered when the clinic runs it, nobody holds it, and it has
    // not already passed.
    const slots = slotsForDate(date)
      .filter((slot) => slot.getTime() > now && !takenAt.has(slot.getTime()))
      .map((slot) => slot.toISOString());

    res.json({ success: true, date, clinicianId: Number(clinicianId), slots });
  } catch (err) {
    next(err);
  }
};

// One appointment, for a screen that was linked straight to it and needs to say
// whose visit it is. Staff read any; a patient reads only their own.
const getById = async (req, res, next) => {
  try {
    const appointment = await Appointment.findByPk(req.params.id, { include: WITH_NAMES });
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

    const profile = await patientProfileFor(req.user);
    if (!mayAct(req.user, appointment, profile)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    res.json({ success: true, appointment: shape(appointment) });
  } catch (err) {
    next(err);
  }
};

const book = async (req, res, next) => {
  let transaction;
  try {
    const { clinicianId, scheduledAt, reason } = req.body;

    // Everything that only needs checking is checked before a transaction is
    // opened. A transaction holds a pool connection for as long as it lives, so
    // reads made inside one that ask for a second connection can exhaust the
    // pool when several bookings arrive together, and then nothing can finish.
    const profile = await patientProfileFor(req.user);
    const patientId = profile ? profile.id : req.body.patientId;

    if (!patientId) return res.status(400).json({ message: 'patientId is required' });
    if (!(await Patient.findByPk(patientId))) {
      return res.status(404).json({ message: 'Patient not found' });
    }
    if (!(await findClinician(clinicianId))) {
      return res.status(404).json({ message: 'Clinician not found' });
    }

    const when = new Date(scheduledAt);
    if (when.getTime() <= Date.now()) {
      return res.status(400).json({ message: 'Appointments are booked in the future' });
    }
    if (!isWorkingTime(when)) {
      return res.status(400).json({ message: "That time is not one of the clinic's slots" });
    }

    // From here the work has to be atomic, and it is only three statements long.
    transaction = await sequelize.transaction();

    // Everything writing into this clinician's diary queues here, so the check
    // below and the insert that follows cannot be separated by another booking.
    await lockClinicianDiary(clinicianId, transaction);

    if (await findClash(clinicianId, when, { transaction })) {
      await transaction.rollback();
      return res.status(409).json({ message: 'That slot is already booked' });
    }

    const created = await Appointment.create(
      { patientId, clinicianId, scheduledAt: when, reason, status: 'scheduled' },
      { transaction }
    );
    await transaction.commit();

    const appointment = await Appointment.findByPk(created.id, { include: WITH_NAMES });

    // The clinician's diary just changed without them doing anything, so they
    // are told. Failing to raise it must not fail the booking.
    notify({
      userId: clinicianId,
      kind: 'appointment-booked',
      title: `New appointment: ${appointment.Patient?.User?.name}`,
      body: `${appointment.reason || 'Appointment'} on ${new Date(
        appointment.scheduledAt
      ).toLocaleString('en-CA')}`,
      link: '/clinician/appointments',
    }).catch(() => {});

    res.status(201).json({ success: true, appointment: shape(appointment) });
  } catch (err) {
    if (transaction && !transaction.finished) await transaction.rollback();
    next(err);
  }
};

const reschedule = async (req, res, next) => {
  let transaction;
  try {
    // As with booking, the checks happen before a transaction is opened so that
    // none of them competes for a second pool connection while one is held.
    const appointment = await Appointment.findByPk(req.params.id);
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

    const profile = await patientProfileFor(req.user);
    if (!mayAct(req.user, appointment, profile)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (appointment.status !== 'scheduled') {
      return res.status(409).json({ message: `A ${appointment.status} appointment cannot be moved` });
    }
    if (isWithinChangeWindow(appointment.scheduledAt)) {
      return res.status(409).json({
        message: `Appointments cannot be changed within ${changeWindowHours()} hours of the visit`,
      });
    }

    const when = new Date(req.body.scheduledAt);
    if (when.getTime() <= Date.now()) {
      return res.status(400).json({ message: 'Appointments are booked in the future' });
    }
    if (!isWorkingTime(when)) {
      return res.status(400).json({ message: "That time is not one of the clinic's slots" });
    }

    transaction = await sequelize.transaction();

    // Same serialization as booking: moving into a slot competes with anyone
    // booking it.
    await lockClinicianDiary(appointment.clinicianId, transaction);

    if (await findClash(appointment.clinicianId, when, { exclude: appointment.id, transaction })) {
      await transaction.rollback();
      return res.status(409).json({ message: 'That slot is already booked' });
    }

    appointment.scheduledAt = when;
    await appointment.save({ transaction });
    await transaction.commit();

    const saved = await Appointment.findByPk(appointment.id, { include: WITH_NAMES });
    res.json({ success: true, appointment: shape(saved) });
  } catch (err) {
    if (transaction && !transaction.finished) await transaction.rollback();
    next(err);
  }
};

const cancel = async (req, res, next) => {
  try {
    const appointment = await Appointment.findByPk(req.params.id);
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

    const profile = await patientProfileFor(req.user);
    if (!mayAct(req.user, appointment, profile)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (appointment.status !== 'scheduled') {
      return res
        .status(409)
        .json({ message: `A ${appointment.status} appointment cannot be cancelled` });
    }
    if (isWithinChangeWindow(appointment.scheduledAt)) {
      return res.status(409).json({
        message: `Appointments cannot be changed within ${changeWindowHours()} hours of the visit`,
      });
    }

    appointment.status = 'cancelled';
    await appointment.save();

    const saved = await Appointment.findByPk(appointment.id, { include: WITH_NAMES });

    notify({
      userId: saved.clinicianId,
      kind: 'appointment-cancelled',
      title: `Cancelled: ${saved.Patient?.User?.name}`,
      body: `The visit on ${new Date(saved.scheduledAt).toLocaleString('en-CA')} was cancelled.`,
      link: '/clinician/appointments',
    }).catch(() => {});

    res.json({ success: true, appointment: shape(saved) });
  } catch (err) {
    next(err);
  }
};

// Marking the outcome of a visit is the clinic's record of what happened, so it
// is staff-only and is not bound by the patient-facing change window.
const setStatus = async (req, res, next) => {
  try {
    const appointment = await Appointment.findByPk(req.params.id);
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

    appointment.status = req.body.status;
    await appointment.save();

    const saved = await Appointment.findByPk(appointment.id, { include: WITH_NAMES });
    res.json({ success: true, appointment: shape(saved) });
  } catch (err) {
    next(err);
  }
};

const daily = async (req, res, next) => {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + 1);

    const appointments = await Appointment.findAll({
      where: {
        scheduledAt: { [Op.between]: [start, end] }
      },
      include: [
        {
          model: Patient,
          include: {
            model: User,
            attributes: ['name', 'email', 'phone']
          }
        },
        {
          model: User,
          as: 'Clinician',
          attributes: ['name', 'email']
        }
      ],
      order: [['scheduledAt', 'ASC']]
    });

    res.json({ success: true, appointments });
  } catch (err) {
    next(err);
  }
};


module.exports = { list, availability, getById, book, reschedule, cancel, setStatus, daily };
