const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models/mysql');

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

const register = async (req, res, next) => {
  try {
    const { email, password, name, phone, role } = req.body;

    const existing = await User.findOne({ where: { email } });
    if (existing) return res.status(409).json({ message: 'Email already registered' });

    const user = await User.create({
      email,
      passwordHash: await bcrypt.hash(password, 10),
      name,
      phone,
      role: role || 'patient',
    });

    res.status(201).json({ success: true, token: signToken(user), user: publicUser(user) });
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

module.exports = { register, login, me };
