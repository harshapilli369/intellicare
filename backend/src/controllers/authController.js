const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models/mysql');
const { sequelize } = require('../config/mysql');
const invitationService = require('../services/invitationService');

const signToken = (user) =>
  jwt.sign({ id: user.id, role: user.role, name: user.name }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const publicUser = (user) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  phone: user.phone,
});

// Public sign-up. The account created is always a patient: this endpoint takes
// no credentials, so a role coming from the request body would let any caller
// hand themselves a clinician or administrator account. Staff are created
// through createStaff below.
const register = async (req, res, next) => {
  try {
    const { email, password, name, phone } = req.body;

    const existing = await User.findOne({ where: { email } });
    if (existing) return res.status(409).json({ message: 'Email already registered' });

    const user = await User.create({
      email,
      passwordHash: await bcrypt.hash(password, 10),
      name,
      phone,
      role: 'patient',
    });

    res.status(201).json({ success: true, token: signToken(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
};

// Creates a clinician or administrator. Restricted to administrators at the
// route, so choosing a role here is a decision an existing administrator has
// already been authorised to make.
const createStaff = async (req, res, next) => {
  try {
    const { email, password, name, phone, role } = req.body;

    const existing = await User.findOne({ where: { email } });
    if (existing) return res.status(409).json({ message: 'Email already registered' });

    const user = await User.create({
      email,
      passwordHash: await bcrypt.hash(password, 10),
      name,
      phone,
      role,
    });

    res.status(201).json({ success: true, user: publicUser(user) });
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // The same response for an unknown email and a wrong password, so the
    // endpoint does not reveal which accounts exist.
    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ message: 'Invalid credentials' });

    res.json({ success: true, token: signToken(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
};

// Says whether a link from an invitation email is still good, and who it is
// for, so the page can greet the patient by name before asking for a password.
//
// A spent, expired, or invented token is all one answer. Distinguishing them
// would tell a caller feeding in guesses which ones had once been real.
const checkInvitation = async (req, res, next) => {
  try {
    const invitation = await invitationService.findLive(req.params.token);
    if (!invitation) {
      return res.status(404).json({ message: 'This invitation is no longer valid' });
    }

    res.json({
      success: true,
      invitation: { name: invitation.User.name, email: invitation.User.email },
    });
  } catch (err) {
    next(err);
  }
};

// Spends an invitation to set the account's first password, and signs the
// patient straight in - having just proved they hold the link, asking them to
// type the password again on a login screen adds nothing.
const acceptInvitation = async (req, res, next) => {
  try {
    const invitation = await invitationService.findLive(req.params.token);
    if (!invitation) {
      return res.status(404).json({ message: 'This invitation is no longer valid' });
    }

    const done = await invitationService.redeem(invitation, req.body.password, { sequelize });
    if (!done) {
      return res.status(409).json({ message: 'This invitation has already been used' });
    }

    const user = await User.findByPk(invitation.userId);
    res.json({ success: true, token: signToken(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
};

// Returns the account behind the current token, so the frontend can restore the
// signed-in user without keeping identity in the token alone.
const me = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ success: true, user: publicUser(user) });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, createStaff, login, me, checkInvitation, acceptInvitation };
