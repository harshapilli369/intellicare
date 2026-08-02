const { User, Patient, Appointment, Prescription } = require('../models/mysql');
const ClinicalNote = require('../models/mongodb/ClinicalNote');
const IntakeSubmission = require('../models/mongodb/IntakeSubmission');

// What the patient said before the visit, flattened into the few lines a brief
// can use. Absent when they did not fill the form in.
const intakeContext = (intake) => {
  if (!intake) return null;

  return {
    mainComplaint: intake.mainComplaint,
    durationDays: intake.durationDays,
    severity: intake.severity,
    medicationsTaken: intake.medicationsTaken,
    additionalNotes: intake.additionalNotes,
    attachmentCount: intake.attachments?.length || 0,
  };
};

// Gathers everything the AI needs to reason about a patient at the time of an
// appointment: their demographics and history from MySQL, their current
// medications from the prescriptions table, their recent clinical notes from
// MongoDB, and anything they submitted themselves ahead of this visit. Returns
// null if the appointment or patient does not exist.
const buildPatientContext = async (appointmentId) => {
  const appointment = await Appointment.findByPk(appointmentId);
  if (!appointment) return null;

  const patient = await Patient.findByPk(appointment.patientId, {
    include: { model: User, attributes: ['name'] },
  });
  if (!patient) return null;

  const prescriptions = await Prescription.findAll({ where: { patientId: patient.id } });

  // Notes from the patient's earlier encounters, most recent first.
  const notes = await ClinicalNote.find({ patientId: patient.id })
    .sort({ createdAt: -1 })
    .limit(5);

  // The form the patient filled in for this visit, if they did.
  const intake = await IntakeSubmission.findOne({ appointmentId });

  return {
    patientId: patient.id,
    context: {
      patientName: patient.User?.name,
      dateOfBirth: patient.dateOfBirth,
      sex: patient.sex,
      medicalHistory: patient.medicalHistory || [],
      allergies: patient.allergies || [],
      medications: prescriptions.map((p) => [p.medication, p.dosage].filter(Boolean).join(' ')),
      previousNotes: notes.map((n) => n.body),
      appointmentReason: appointment.reason,
      patientIntake: intakeContext(intake),
    },
  };
};

module.exports = { buildPatientContext };
