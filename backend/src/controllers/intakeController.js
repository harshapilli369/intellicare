const { Appointment } = require('../models/mysql');
const IntakeSubmission = require('../models/mongodb/IntakeSubmission');
const { patientProfileFor } = require('../middleware/ownership');

// Attachments never travel with the submission itself; only enough to list them
// and fetch one. Sending the bytes inside a JSON list would make reading an
// intake form as expensive as downloading everything attached to it.
const shape = (submission) => ({
  id: submission._id,
  appointmentId: submission.appointmentId,
  patientId: submission.patientId,
  mainComplaint: submission.mainComplaint,
  durationDays: submission.durationDays,
  severity: submission.severity,
  medicationsTaken: submission.medicationsTaken,
  additionalNotes: submission.additionalNotes,
  submittedAt: submission.createdAt,
  updatedAt: submission.updatedAt,
  attachments: submission.attachments.map((file, index) => ({
    index,
    filename: file.filename,
    mimetype: file.mimetype,
    size: file.size,
  })),
});

// Staff read any appointment's intake; a patient only their own. Returns the
// appointment when the caller may see it, or null.
const reachableAppointment = async (user, appointmentId) => {
  const appointment = await Appointment.findByPk(appointmentId);
  if (!appointment) return null;

  if (user.role === 'patient') {
    const profile = await patientProfileFor(user);
    if (!profile || profile.id !== appointment.patientId) return null;
  }
  return appointment;
};

// A patient completes the form for one of their own visits. Submitting again
// replaces the previous answers rather than adding a second form, since a
// clinician reading it before the visit should find one current account.
const submit = async (req, res, next) => {
  try {
    const appointmentId = Number(req.params.appointmentId);

    const profile = await patientProfileFor(req.user);
    if (!profile) return res.status(403).json({ message: 'Forbidden' });

    const appointment = await Appointment.findByPk(appointmentId);
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });
    if (appointment.patientId !== profile.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (appointment.status !== 'scheduled') {
      return res
        .status(409)
        .json({ message: `Intake is for an upcoming visit, and this one is ${appointment.status}` });
    }

    const attachments = (req.files || []).map((file) => ({
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      data: file.buffer,
    }));

    const { mainComplaint, durationDays, severity, medicationsTaken, additionalNotes } = req.body;

    const submission = await IntakeSubmission.findOneAndUpdate(
      { appointmentId },
      {
        appointmentId,
        patientId: profile.id,
        mainComplaint,
        durationDays: durationDays === undefined || durationDays === '' ? null : Number(durationDays),
        severity: severity === undefined || severity === '' ? null : Number(severity),
        medicationsTaken: medicationsTaken || null,
        additionalNotes: additionalNotes || null,
        // Files are only replaced when new ones are sent, so editing the written
        // answers does not silently drop what was already uploaded.
        ...(attachments.length > 0 ? { attachments } : {}),
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({ success: true, intake: shape(submission) });
  } catch (err) {
    next(err);
  }
};

const getForAppointment = async (req, res, next) => {
  try {
    const appointmentId = Number(req.params.appointmentId);

    if (!(await reachableAppointment(req.user, appointmentId))) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    const submission = await IntakeSubmission.findOne({ appointmentId });
    if (!submission) return res.status(404).json({ message: 'No intake form for this appointment' });

    res.json({ success: true, intake: shape(submission) });
  } catch (err) {
    next(err);
  }
};

// Streams one attachment back. The access check is the same as for the form it
// belongs to, so a file cannot be reached by guessing its position.
const downloadAttachment = async (req, res, next) => {
  try {
    const appointmentId = Number(req.params.appointmentId);
    const index = Number(req.params.index);

    if (!(await reachableAppointment(req.user, appointmentId))) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    const submission = await IntakeSubmission.findOne({ appointmentId });
    const file = submission?.attachments?.[index];
    if (!file) return res.status(404).json({ message: 'Attachment not found' });

    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.data);
  } catch (err) {
    next(err);
  }
};

module.exports = { submit, getForAppointment, downloadAttachment };
