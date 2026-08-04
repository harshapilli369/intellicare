const mongoose = require('mongoose');

// How one patient wants to be reminded about their appointments.
//
// The clinic has a default - the offsets in the environment - and this is a
// patient departing from it. Absent means "whatever the clinic does", which is
// why there is no row for most people and no migration to write for the ones
// who never touch it.
//
// In MongoDB with the other operational records rather than as columns on the
// patient: `offsetsHours` is a list, and `sequelize.sync()` cannot add columns
// to a table that already exists, so a relational home would need a
// hand-written migration to gain nothing.
const reminderPreferenceSchema = new mongoose.Schema(
  {
    patientId: { type: Number, required: true, unique: true },
    // How many hours before a visit to be reminded. An empty list is a patient
    // saying "do not remind me", which is different from having no preference
    // at all - so the list being empty must not fall back to the clinic default.
    offsetsHours: { type: [Number], default: undefined },
    // Which ways they want to hear about it.
    email: { type: Boolean, default: true },
    inApp: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ReminderPreference', reminderPreferenceSchema);
