const { Op } = require('sequelize');

const { Appointment, Patient, User } = require('../models/mysql');
const IntakeSubmission = require('../models/mongodb/IntakeSubmission');
const IntakeRequest = require('../models/mongodb/IntakeRequest');
const { patientProfileFor } = require('../middleware/ownership');
const { notify } = require('../services/notificationService');
const { sendMail } = require('../services/emailService');
const { formatWhen } = require('../utils/datetime');
const { safeContentType, safeFilename } = require('../utils/uploads');

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

    // Submitting answers whatever the clinic asked for. Marked rather than
    // deleted, so the record still shows a form was requested and when it was
    // answered.
    await IntakeRequest.findOneAndUpdate(
      { appointmentId, fulfilledAt: null },
      { fulfilledAt: new Date() }
    );

    res.status(201).json({ success: true, intake: shape(submission) });
  } catch (err) {
    next(err);
  }
};

// The clinic asking a patient to fill their form in before a visit. Asking
// again is a nudge rather than a second request, so it updates the one that is
// already outstanding and sends the patient another notification.
const request = async (req, res, next) => {
  try {
    const appointmentId = Number(req.params.appointmentId);

    const appointment = await Appointment.findByPk(appointmentId, {
      include: [{ model: Patient, include: [{ model: User, attributes: ['id', 'name', 'email'] }] }],
    });
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

    // Nothing to prepare for a visit that has already happened or been called
    // off, and asking would only confuse the patient.
    if (appointment.status !== 'scheduled') {
      return res.status(409).json({
        message: `Intake is for an upcoming visit, and this one is ${appointment.status}`,
      });
    }

    const existing = await IntakeSubmission.findOne({ appointmentId });
    if (existing) {
      return res.status(409).json({ message: 'This patient has already filled in their form' });
    }

    const message = req.body.message ? String(req.body.message).trim() : null;

    const intakeRequest = await IntakeRequest.findOneAndUpdate(
      { appointmentId },
      {
        appointmentId,
        patientId: appointment.patientId,
        requestedBy: req.user.id,
        message,
        fulfilledAt: null,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const account = appointment.Patient?.User;
    const when = formatWhen(appointment.scheduledAt);

    // Told in the app, and by email where mail is configured. Neither failing
    // should lose the request itself, which is already saved by this point.
    notify({
      userId: account?.id,
      kind: 'intake-requested',
      title: 'Your clinic would like some details before your visit',
      body: message || `Please fill in your intake form for your appointment on ${when}.`,
      link: '/patient/appointments',
    }).catch(() => {});

    sendMail({
      to: account?.email,
      subject: 'Before your IntelliCare appointment',
      text: [
        `Hello ${account?.name || 'there'},`,
        '',
        message ||
          'Your clinic would like a few details before your visit, so your clinician can',
        message ? '' : 'prepare for it.',
        '',
        `Appointment: ${when}`,
        '',
        'Sign in and open the appointment to fill in your intake form.',
      ].join('\n'),
    }).catch(() => {});

    res.status(201).json({
      success: true,
      request: {
        appointmentId: intakeRequest.appointmentId,
        message: intakeRequest.message,
        requestedAt: intakeRequest.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

// What a patient still has to fill in. Read by their own dashboard, so it is
// scoped to them from the token rather than from anything they send.
const outstandingForMe = async (req, res, next) => {
  try {
    const profile = await patientProfileFor(req.user);
    if (!profile) return res.json({ success: true, outstanding: [] });

    const requests = await IntakeRequest.find({
      patientId: profile.id,
      fulfilledAt: null,
    }).sort({ createdAt: -1 });

    if (requests.length === 0) return res.json({ success: true, outstanding: [] });

    // A request for a visit that has since been cancelled or has already
    // happened is not something to chase, so the appointment decides whether it
    // still counts.
    const appointments = await Appointment.findAll({
      where: { id: { [Op.in]: requests.map((r) => r.appointmentId) }, status: 'scheduled' },
      include: [{ model: User, as: 'clinician', attributes: ['name'] }],
    });
    const byId = new Map(appointments.map((a) => [a.id, a]));

    const outstanding = requests
      .filter((r) => byId.has(r.appointmentId))
      .map((r) => {
        const visit = byId.get(r.appointmentId);
        return {
          appointmentId: r.appointmentId,
          message: r.message,
          requestedAt: r.createdAt,
          scheduledAt: visit.scheduledAt,
          clinicianName: visit.clinician?.name || null,
          reason: visit.reason,
        };
      });

    res.json({ success: true, outstanding });
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

    // Neither the type nor the name is trusted, both having come from whoever
    // uploaded the file. An unrecognised type is served opaquely rather than
    // echoed back, and the name is stripped of anything that could end the
    // header field early and rewrite the disposition.
    res.setHeader('Content-Type', safeContentType(file.mimetype));
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename(file.filename)}"`);
    // Belt and braces: refuses to let a browser guess a type more dangerous
    // than the one declared.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(file.data);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  submit,
  request,
  outstandingForMe,
  getForAppointment,
  downloadAttachment,
};
