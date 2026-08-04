const mongoose = require('mongoose');

// One row per auditable action against a patient record: an export, a bulk
// import, or an invitation to set a password. Kept in MongoDB alongside the
// other operational logs (Notification, ReminderDispatch) rather than MySQL,
// since nothing here is relational and it is only ever queried by who did it or
// which patient it concerns.
//
// An invitation is worth recording for the same reason an export is: it is a
// staff member reaching into somebody's account, and it grants whoever holds
// the link the ability to set a password on it.
const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, enum: ['export', 'import', 'invite', 'update'], required: true },
    // The patient the action concerns. Absent for a bulk import, which is not
    // about a single patient.
    patientId: { type: Number, default: null },
    performedBy: { type: Number, required: true },
    performedByRole: { type: String, required: true },
    // 'csv' | 'json' | 'pdf' for an export. Unused for an import.
    format: { type: String, default: null },
    // Free-form detail: what an export contained, or an import's row counts.
    detail: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

// The audit trail is read as "everything for this patient" or "everything by
// this user", both newest first.
auditLogSchema.index({ patientId: 1, createdAt: -1 });
auditLogSchema.index({ performedBy: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
