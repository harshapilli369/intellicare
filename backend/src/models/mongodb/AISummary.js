const mongoose = require('mongoose');
const crypto = require('crypto');

const aiSummarySchema = new mongoose.Schema(
  {
    patientId: { type: Number, required: true },
    appointmentId: { type: Number, required: true, unique: true },
    preSummary: { type: String, default: null },
    clinicianSummary: { type: String, default: null },
    patientSummary: { type: String, default: null },
    finalized: { type: Boolean, default: false },
    inputHash: { type: String, default: null },
  },
  { timestamps: true }
);

aiSummarySchema.statics.hashInput = (context) => {
  return crypto.createHash('sha256').update(JSON.stringify(context)).digest('hex');
};

module.exports = mongoose.model('AISummary', aiSummarySchema);
