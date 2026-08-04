const mongoose = require('mongoose');

// A clinic asking a patient to fill in their intake form before a visit.
//
// Intake already worked, but only as something a patient volunteered - there
// was no way to ask for one, so nothing was ever outstanding and the patient's
// dashboard had nothing to show. This is the asking.
//
// Kept in MongoDB alongside the other operational records rather than as a
// column on the appointment: it is not part of the appointment's own identity,
// and `sequelize.sync()` cannot add a column to a table that already exists,
// so a relational home would need a hand-written migration for no benefit.
const intakeRequestSchema = new mongoose.Schema(
  {
    // One outstanding request per visit. Asking twice is a reminder, not a
    // second request, so the unique index makes the repeat an update.
    appointmentId: { type: Number, required: true, unique: true },
    patientId: { type: Number, required: true },
    requestedBy: { type: Number, required: true },
    // A note from the clinic about what they would like to know.
    message: { type: String, default: null },
    // Set when the patient submits, which is what stops it being outstanding.
    fulfilledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// The patient's dashboard asks "what is still outstanding for me", newest first.
intakeRequestSchema.index({ patientId: 1, fulfilledAt: 1, createdAt: -1 });

module.exports = mongoose.model('IntakeRequest', intakeRequestSchema);
