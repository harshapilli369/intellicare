const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const { Invitation, User } = require('../models/mysql');
const { sendMail } = require('./emailService');

// Long enough that guessing is not a strategy, and read from the system's
// randomness rather than Math.random, which is predictable from its own output.
const TOKEN_BYTES = 32;

const DEFAULT_LIFETIME_DAYS = Number(process.env.INVITATION_LIFETIME_DAYS) || 7;

// Only ever the hash is stored, so the table cannot be turned back into working
// links by anyone who reads it. SHA-256 rather than bcrypt on purpose: this is
// 256 bits of randomness, not a password, so there is nothing to slow down a
// guesser about - and a lookup has to be able to find the row.
const digest = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Where the patient lands. The frontend origin is the one already configured
// for CORS, so there is no second URL to keep in step.
const linkFor = (token) => {
  const base = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
  return `${base}/invite/${token}`;
};

// Issues a fresh invitation, retiring any the account is still holding so that
// only the newest link works. Returns the raw token, which exists here and in
// the link and nowhere else.
const issue = async (userId, { transaction } = {}) => {
  await Invitation.destroy({ where: { userId, redeemedAt: null }, transaction });

  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  const expiresAt = new Date(Date.now() + DEFAULT_LIFETIME_DAYS * 24 * 60 * 60 * 1000);

  await Invitation.create({ userId, tokenHash: digest(token), expiresAt }, { transaction });

  return { token, link: linkFor(token), expiresAt };
};

// Sends the link. Reports what happened rather than throwing, so importing a
// hundred patients is not stopped by one address being unreachable - and so the
// screen can say plainly when mail is not configured and the link has to be
// passed on by hand.
const send = async (user, invitation) => {
  const result = await sendMail({
    to: user.email,
    subject: 'Set up your IntelliCare account',
    text: [
      `Hello ${user.name},`,
      '',
      'An account has been created for you at your clinic. Choose a password to',
      'finish setting it up:',
      '',
      invitation.link,
      '',
      `The link works once, and expires on ${invitation.expiresAt.toDateString()}.`,
      '',
      'If you were not expecting this, you can ignore it - the account cannot be',
      'used until a password is set.',
    ].join('\n'),
  });

  return result.status;
};

// Looks up a live invitation by the token from the link. Expired and already
// redeemed ones are refused here, so neither the caller nor the route has to
// remember to check.
const findLive = async (token) => {
  if (typeof token !== 'string' || token.length !== TOKEN_BYTES * 2) return null;

  const invitation = await Invitation.findOne({
    where: { tokenHash: digest(token) },
    include: [{ model: User, attributes: ['id', 'name', 'email'] }],
  });

  if (!invitation) return null;
  if (invitation.redeemedAt) return null;
  if (invitation.expiresAt.getTime() < Date.now()) return null;

  return invitation;
};

// Sets the password and spends the invitation. The redemption is marked in the
// same transaction as the password change, so a link cannot be used twice by
// two requests arriving together.
const redeem = async (invitation, password, { sequelize }) => {
  const transaction = await sequelize.transaction();
  try {
    // Re-read under a lock: whichever request gets here first marks it, and the
    // second finds it already spent rather than setting the password again.
    const held = await Invitation.findByPk(invitation.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!held || held.redeemedAt) {
      await transaction.rollback();
      return false;
    }

    await User.update(
      { passwordHash: await bcrypt.hash(password, 10) },
      { where: { id: held.userId }, transaction }
    );

    held.redeemedAt = new Date();
    await held.save({ transaction });

    await transaction.commit();
    return true;
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
};

module.exports = { issue, send, findLive, redeem, linkFor };
