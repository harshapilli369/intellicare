const { sequelize } = require('../../config/mysql');

const User = require('./User')(sequelize);
const Patient = require('./Patient')(sequelize);
const Appointment = require('./Appointment')(sequelize);
const Prescription = require('./Prescription')(sequelize);
const Invitation = require('./Invitation')(sequelize);

// A patient's login account and their profile are one-to-one.
User.hasOne(Patient, { foreignKey: 'userId', onDelete: 'CASCADE' });
Patient.belongsTo(User, { foreignKey: 'userId' });

// An appointment belongs to a patient and to the clinician (a User) seeing them.
Patient.hasMany(Appointment, { foreignKey: 'patientId' });
Appointment.belongsTo(Patient, { foreignKey: 'patientId' });
User.hasMany(Appointment, { foreignKey: 'clinicianId', as: 'clinicianAppointments' });
Appointment.belongsTo(User, { foreignKey: 'clinicianId', as: 'clinician' });

// A prescription belongs to a patient, the issuing clinician, and (optionally)
// the appointment it was written during.
Patient.hasMany(Prescription, { foreignKey: 'patientId' });
Prescription.belongsTo(Patient, { foreignKey: 'patientId' });
Appointment.hasMany(Prescription, { foreignKey: 'appointmentId' });
Prescription.belongsTo(Appointment, { foreignKey: 'appointmentId' });
Prescription.belongsTo(User, { foreignKey: 'clinicianId', as: 'clinician' });

// An invitation belongs to the account it lets somebody into. Deleting the
// account takes any outstanding invitation with it, so a token can never
// outlive the user it was written for.
User.hasMany(Invitation, { foreignKey: 'userId', onDelete: 'CASCADE' });
Invitation.belongsTo(User, { foreignKey: 'userId' });

// Creates any missing tables. Used in development; production would run
// migrations instead of syncing from the model definitions.
const syncModels = () => sequelize.sync();

module.exports = { User, Patient, Appointment, Prescription, Invitation, syncModels };
