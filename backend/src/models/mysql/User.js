const { DataTypes } = require('sequelize');

// Every person who signs in is a User: clinicians, administrative assistants,
// and patients. A patient additionally has a linked Patient profile.
module.exports = (sequelize) =>
  sequelize.define(
    'User',
    {
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: { isEmail: true },
      },
      passwordHash: { type: DataTypes.STRING, allowNull: false },
      role: {
        type: DataTypes.ENUM('clinician', 'admin', 'patient'),
        allowNull: false,
      },
      name: { type: DataTypes.STRING, allowNull: false },
      phone: { type: DataTypes.STRING, allowNull: true },
    },
    { tableName: 'users' }
  );
