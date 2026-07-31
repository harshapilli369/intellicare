const { DataTypes } = require('sequelize');

// Demographic and clinical profile for a patient. Linked one-to-one to the
// User the patient signs in with. Clinicians and admins have no Patient row.
module.exports = (sequelize) =>
  sequelize.define(
    'Patient',
    {
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
      },
      dateOfBirth: { type: DataTypes.DATEONLY, allowNull: true },
      sex: {
        type: DataTypes.ENUM('Male', 'Female', 'Other'),
        allowNull: true,
      },
      address: { type: DataTypes.STRING, allowNull: true },
      // The provincial health number a patient is identified by at reception.
      healthCardNumber: { type: DataTypes.STRING, allowNull: true },
      // Variable-length lists kept as JSON columns rather than separate tables,
      // since they are read as a whole with the patient and never queried on
      // their own.
      medicalHistory: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
      allergies: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    },
    {
      tableName: 'patients',
      // Removing a patient is a soft delete. The appointments, prescriptions,
      // and notes that reference this row have to stay readable for the record,
      // so the profile is marked deleted rather than dropped.
      paranoid: true,
    }
  );
