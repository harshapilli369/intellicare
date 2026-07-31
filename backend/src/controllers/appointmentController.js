const { Op } = require('sequelize');

const { sequelize } = require('../config/mysql');
const { Appointment, Patient, User } = require('../models/mysql');
const { patientProfileFor } = require('../middleware/ownership');
const {
  HOLDS_A_SLOT,
  startOfDay,
  endOfDay,
  slotsForDate,
  isWorkingTime,
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

const book = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { clinicianId, scheduledAt, reason } = req.body;

    // A patient books for themselves whatever the body says; staff book on
    // anyone's behalf and must name the patient.
    const profile = await patientProfileFor(req.user);
    const patientId = profile ? profile.id : req.body.patientId;

    if (!patientId) {
      await transaction.rollback();
      return res.status(400).json({ message: 'patientId is required' });
    }
    if (!(await Patient.findByPk(patientId, { transaction }))) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Patient not found' });
    }
    if (!(await findClinician(clinicianId))) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Clinician not found' });
    }

    const when = new Date(scheduledAt);
    if (when.getTime() <= Date.now()) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Appointments are booked in the future' });
    }
    if (!isWorkingTime(when)) {
      await transaction.rollback();
      return res.status(400).json({ message: "That time is not one of the clinic's slots" });
    }

    // Read and hold the slot inside the transaction, so the check and the
    // insert cannot be separated by another booking.
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
    res.status(201).json({ success: true, appointment: shape(appointment) });
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    next(err);
  }
};

const reschedule = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const appointment = await Appointment.findByPk(req.params.id, { transaction });
    if (!appointment) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Appointment not found' });
    }

    const profile = await patientProfileFor(req.user);
    if (!mayAct(req.user, appointment, profile)) {
      await transaction.rollback();
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (appointment.status !== 'scheduled') {
      await transaction.rollback();
      return res.status(409).json({ message: `A ${appointment.status} appointment cannot be moved` });
    }
    if (isWithinChangeWindow(appointment.scheduledAt)) {
      await transaction.rollback();
      return res.status(409).json({
        message: `Appointments cannot be changed within ${changeWindowHours()} hours of the visit`,
      });
    }

    const when = new Date(req.body.scheduledAt);
    if (when.getTime() <= Date.now()) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Appointments are booked in the future' });
    }
    if (!isWorkingTime(when)) {
      await transaction.rollback();
      return res.status(400).json({ message: "That time is not one of the clinic's slots" });
    }
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
    if (!transaction.finished) await transaction.rollback();
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

module.exports = { list, availability, book, reschedule, cancel, setStatus };
