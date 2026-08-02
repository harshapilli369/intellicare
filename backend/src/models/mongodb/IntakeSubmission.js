const mongoose = require('mongoose');

// What a patient tells the clinic before a visit, and anything they attach.
//
// The file bytes are held here rather than on disk deliberately. The backend is
// deployed to a host with an ephemeral filesystem, so anything written beside
// the application disappears on the next deploy; a handful of small documents
// per appointment sits comfortably inside a MongoDB document instead. Large
// files at any volume would want object storage, and this is capped to keep
// that decision from being forced by accident.
const attachmentSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true },
    mimetype: { type: String, required: true },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true },
  },
  { _id: false }
);

const intakeSubmissionSchema = new mongoose.Schema(
  {
    // One intake per appointment; submitting again replaces what was there.
    appointmentId: { type: Number, required: true, unique: true },
    patientId: { type: Number, required: true },

    // The structured part. Kept deliberately short: a patient filling this in
    // before a visit will not complete a long form, and the clinician reads it
    // in the few seconds before they walk in.
    mainComplaint: { type: String, required: true },
    durationDays: { type: Number, default: null },
    severity: { type: Number, min: 1, max: 10, default: null },
    medicationsTaken: { type: String, default: null },
    additionalNotes: { type: String, default: null },

    attachments: { type: [attachmentSchema], default: [] },
  },
  { timestamps: true }
);

// Read for one appointment, or as everything a patient has ever submitted.
intakeSubmissionSchema.index({ patientId: 1, createdAt: -1 });

module.exports = mongoose.model('IntakeSubmission', intakeSubmissionSchema);
