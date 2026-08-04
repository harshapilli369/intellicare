const mongoose = require('mongoose');

// A clinician's note for a single encounter. Stored in MongoDB because the
// length and structure of clinical writing varies. The appointment, patient,
// and author ids reference their MySQL rows.
const clinicalNoteSchema = new mongoose.Schema(
  {
    appointmentId: { type: Number, required: true },
    patientId: { type: Number, required: true },
    authorId: { type: Number, required: true },
    body: { type: String, required: true },
  },
  { timestamps: true }
);

// Notes are read for one appointment, or as a patient's history newest first.
clinicalNoteSchema.index({ appointmentId: 1, createdAt: -1 });
clinicalNoteSchema.index({ patientId: 1, createdAt: -1 });

module.exports = mongoose.model('ClinicalNote', clinicalNoteSchema);
