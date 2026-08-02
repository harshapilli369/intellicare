const { DataTypes } = require('sequelize');

// An unredeemed offer to set a password. Issued when a patient is created
// without one - a bulk import, mainly - so that nobody has to invent a password
// on their behalf and then find a way to tell them what it is.
//
// The token itself is never stored. Only its hash is kept, so the table is
// worth nothing to anyone who reads it: the raw token exists once, in the link
// handed to the patient. This is the same reason passwords are hashed, and the
// reason matters more here because an invitation grants the account outright.
module.exports = (sequelize) =>
  sequelize.define(
    'Invitation',
    {
      userId: { type: DataTypes.INTEGER, allowNull: false },
      tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      // Set the moment it is redeemed, which is what makes it single use.
      redeemedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'invitations',
      indexes: [{ fields: ['userId'] }],
    }
  );
