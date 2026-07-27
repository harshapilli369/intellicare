const { DataTypes } = require('sequelize');

// A scheduled encounter between a patient and a clinician. The clinician is a
// User with the clinician role; the patient is a Patient profile.
module.exports = (sequelize) =>
  sequelize.define(
    'Appointment',
    {
      patientId: { type: DataTypes.INTEGER, allowNull: false },
      clinicianId: { type: DataTypes.INTEGER, allowNull: false },
      scheduledAt: { type: DataTypes.DATE, allowNull: false },
      status: {
        type: DataTypes.ENUM('scheduled', 'completed', 'cancelled', 'no_show'),
        allowNull: false,
        defaultValue: 'scheduled',
      },
      reason: { type: DataTypes.STRING, allowNull: true },
    },
    {
      tableName: 'appointments',
      indexes: [
        { fields: ['clinicianId', 'scheduledAt'] },
        { fields: ['patientId', 'scheduledAt'] },
      ],
    }
  );
