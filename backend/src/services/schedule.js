const { Op } = require('sequelize');

const { Appointment, User } = require('../models/mysql');

// The clinic's working day, as fixed-length slots. Kept in configuration rather
// than per-clinician working hours, which the schema does not model yet.
const clinicHours = () => ({
  openHour: Number(process.env.CLINIC_OPEN_HOUR) || 9,
  closeHour: Number(process.env.CLINIC_CLOSE_HOUR) || 17,
  slotMinutes: Number(process.env.APPOINTMENT_SLOT_MINUTES) || 30,
});

// How close to an appointment it may still be moved or cancelled.
const changeWindowHours = () => Number(process.env.APPOINTMENT_CHANGE_WINDOW_HOURS) || 24;

// A cancelled appointment releases its slot; anything else still holds it.
const HOLDS_A_SLOT = { [Op.ne]: 'cancelled' };

const startOfDay = (year, month, day) => new Date(year, month - 1, day, 0, 0, 0, 0);
const endOfDay = (year, month, day) => new Date(year, month - 1, day, 23, 59, 59, 999);

// Every slot the clinic runs on the given date, whether free or not.
const slotsForDate = (dateString) => {
  const [year, month, day] = dateString.split('-').map(Number);
  const { openHour, closeHour, slotMinutes } = clinicHours();
  const slots = [];

  for (let hour = openHour; hour < closeHour; hour += 1) {
    for (let minute = 0; minute < 60; minute += slotMinutes) {
      slots.push(new Date(year, month - 1, day, hour, minute, 0, 0));
    }
  }

  return slots;
};

// A time is bookable only if it is one of the clinic's slots on its own date.
// Checking against the generated grid keeps this in step with the slot length
// rather than repeating the arithmetic.
const isWorkingTime = (when) => {
  const dateString = [
    when.getFullYear(),
    String(when.getMonth() + 1).padStart(2, '0'),
    String(when.getDate()).padStart(2, '0'),
  ].join('-');

  return slotsForDate(dateString).some((slot) => slot.getTime() === when.getTime());
};

// Takes an exclusive lock on the clinician's own row for the rest of the
// transaction, so that everything booking into that clinician's diary happens
// one at a time.
//
// The obvious alternative - locking the slot itself with a `FOR UPDATE` search
// of the appointments table - does not work here. A search that matches nothing
// takes a gap lock rather than a row lock, several transactions can hold the
// same gap at once, and each then needs an insert-intention lock that conflicts
// with the others. They deadlock, or sit until the lock wait times out.
// Locking a row that already exists avoids gap locks entirely, and clinicians
// never contend with each other because each holds a different row.
const lockClinicianDiary = (clinicianId, transaction) =>
  User.findByPk(clinicianId, { transaction, lock: transaction.LOCK.UPDATE });

// The appointment already holding this clinician's slot, if there is one.
// `exclude` skips the appointment being moved, so it does not clash with itself.
// Callers that are about to write must hold the diary lock first; this read
// takes no lock of its own.
const findClash = async (clinicianId, when, { exclude, transaction } = {}) => {
  const where = {
    clinicianId,
    scheduledAt: when,
    status: HOLDS_A_SLOT,
  };
  if (exclude) where.id = { [Op.ne]: exclude };

  return Appointment.findOne({ where, transaction });
};

// Whether an appointment is still far enough away to be changed.
const isWithinChangeWindow = (scheduledAt) =>
  (new Date(scheduledAt).getTime() - Date.now()) / 3_600_000 < changeWindowHours();

module.exports = {
  clinicHours,
  changeWindowHours,
  HOLDS_A_SLOT,
  startOfDay,
  endOfDay,
  slotsForDate,
  isWorkingTime,
  lockClinicianDiary,
  findClash,
  isWithinChangeWindow,
};
