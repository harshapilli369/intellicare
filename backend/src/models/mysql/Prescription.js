const { DataTypes } = require('sequelize');

// A medication issued by a clinician to a patient, usually during a specific
// appointment. Becomes part of the patient's current medication list and feeds
// the context used for pre-appointment AI summaries.
module.exports = (sequelize) =>
  sequelize.define(
    'Prescription',
    {
      patientId: { type: DataTypes.INTEGER, allowNull: false },
      clinicianId: { type: DataTypes.INTEGER, allowNull: false },
      appointmentId: { type: DataTypes.INTEGER, allowNull: true },
      medication: { type: DataTypes.STRING, allowNull: false },
      dosage: { type: DataTypes.STRING, allowNull: true },
      frequency: { type: DataTypes.STRING, allowNull: true },
      route: { type: DataTypes.STRING, allowNull: true },
      duration: { type: DataTypes.STRING, allowNull: true },
    },
    {
      tableName: 'prescriptions',
      indexes: [{ fields: ['patientId'] }],
    }
  );
