const ClinicalNote = require('../models/mongodb/ClinicalNote');
const { Appointment } = require('../models/mysql');

// How long after writing a note its author may still revise it. A clinical
// record is not rewritten freely; once the window closes the note stands.
const editWindowHours = () => Number(process.env.NOTE_EDIT_WINDOW_HOURS) || 24;

const shape = (note) => ({
  id: note._id,
  appointmentId: note.appointmentId,
  patientId: note.patientId,
  authorId: note.authorId,
  body: note.body,
  createdAt: note.createdAt,
  updatedAt: note.updatedAt,
});

const create = async (req, res, next) => {
  try {
    const { appointmentId, body } = req.body;

    // The appointment is what ties a note to a patient, so an unknown
    // appointment cannot produce a note.
    const appointment = await Appointment.findByPk(appointmentId);
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

    const note = await ClinicalNote.create({
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      authorId: req.user.id,
      body,
    });

    res.status(201).json({ success: true, note: shape(note) });
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const note = await ClinicalNote.findById(req.params.id);
    if (!note) return res.status(404).json({ message: 'Note not found' });

    // A note belongs to the clinician who wrote it; another clinician does not
    // revise someone else's account of an encounter.
    if (note.authorId !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const elapsedHours = (Date.now() - note.createdAt.getTime()) / 3_600_000;
    if (elapsedHours > editWindowHours()) {
      return res.status(409).json({ message: 'This note can no longer be edited' });
    }

    note.body = req.body.body;
    await note.save();

    res.json({ success: true, note: shape(note) });
  } catch (err) {
    next(err);
  }
};

// Oldest first, so the notes read back as the encounter history in the order it
// happened.
const listForPatient = async (req, res, next) => {
  try {
    const notes = await ClinicalNote.find({ patientId: req.params.patientId }).sort({
      createdAt: 1,
    });
    res.json({ success: true, notes: notes.map(shape) });
  } catch (err) {
    next(err);
  }
};

const listForAppointment = async (req, res, next) => {
  try {
    const notes = await ClinicalNote.find({ appointmentId: req.params.appointmentId }).sort({
      createdAt: 1,
    });
    res.json({ success: true, notes: notes.map(shape) });
  } catch (err) {
    next(err);
  }
};

module.exports = { create, update, listForPatient, listForAppointment };
