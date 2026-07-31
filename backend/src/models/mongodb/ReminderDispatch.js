const mongoose = require('mongoose');

// One row per reminder actually sent for an appointment. Its only job is to
// stop the same reminder going out twice: the scan runs repeatedly and an
// appointment stays inside its reminder horizon until it happens.
const reminderDispatchSchema = new mongoose.Schema(
  {
    appointmentId: { type: Number, required: true },
    patientId: { type: Number, required: true },
    // Which reminder this was, in hours before the appointment.
    offsetHours: { type: Number, required: true },
    channel: { type: String, default: 'email' },
    to: { type: String, default: null },
    status: {
      type: String,
      enum: ['sent', 'failed', 'skipped'],
      default: 'sent',
    },
    detail: { type: String, default: null },
  },
  { timestamps: true }
);

// The guard against duplicates. Claiming a row before sending means a second
// scan finds the slot taken rather than sending again, so idempotency comes
// from the database rather than from timing the job carefully.
reminderDispatchSchema.index({ appointmentId: 1, offsetHours: 1 }, { unique: true });

module.exports = mongoose.model('ReminderDispatch', reminderDispatchSchema);
