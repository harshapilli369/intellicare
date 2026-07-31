const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');

const { sequelize } = require('../config/mysql');
const { User, Patient, Appointment, Prescription } = require('../models/mysql');

// The account columns a patient record is allowed to expose. Never includes the
// password hash.
const USER_FIELDS = ['id', 'name', 'email', 'phone'];

// A patient is stored across two tables: the account they sign in with and the
// clinical profile. Clients see one object, so both halves are flattened here
// and every response goes through this function.
const shape = (patient) => ({
  id: patient.id,
  userId: patient.userId,
  name: patient.User?.name,
  email: patient.User?.email,
  phone: patient.User?.phone,
  dateOfBirth: patient.dateOfBirth,
  sex: patient.sex,
  address: patient.address,
  medicalHistory: patient.medicalHistory || [],
  allergies: patient.allergies || [],
});

const list = async (req, res, next) => {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const search = (req.query.search || '').trim();
    const { sex } = req.query;

    // A patient is looked up by the name or email on their account, so the
    // search filters the joined User and not the profile itself.
    const userWhere = search
      ? {
          [Op.or]: [
            { name: { [Op.like]: `%${search}%` } },
            { email: { [Op.like]: `%${search}%` } },
          ],
        }
      : undefined;

    // Filters read from the profile, so they stay on the Patient side and
    // narrow the same query rather than trimming an already-paginated page.
    const profileWhere = sex ? { sex } : undefined;

    const { rows, count } = await Patient.findAndCountAll({
      where: profileWhere,
      include: { model: User, attributes: USER_FIELDS, where: userWhere, required: true },
      order: [[User, 'name', 'ASC']],
      limit,
      offset: (page - 1) * limit,
    });

    res.json({
      success: true,
      patients: rows.map(shape),
      page,
      limit,
      total: count,
      pages: Math.ceil(count / limit),
    });
  } catch (err) {
    next(err);
  }
};

const getById = async (req, res, next) => {
  try {
    const patient = await Patient.findByPk(req.params.id, {
      include: { model: User, attributes: USER_FIELDS },
    });
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    // Medications and visit history are read separately so each can carry its
    // own ordering; the profile screen shows both newest first.
    const prescriptions = await Prescription.findAll({
      where: { patientId: patient.id },
      order: [['createdAt', 'DESC']],
    });
    const appointments = await Appointment.findAll({
      where: { patientId: patient.id },
      order: [['scheduledAt', 'DESC']],
    });

    res.json({
      success: true,
      patient: { ...shape(patient), prescriptions, appointments },
    });
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { email, password, name, phone } = req.body;
    const { dateOfBirth, sex, address, medicalHistory, allergies } = req.body;

    const existing = await User.findOne({ where: { email }, transaction });
    if (existing) {
      await transaction.rollback();
      return res.status(409).json({ message: 'Email already registered' });
    }

    // The sign-in account and the clinical profile are written together: a
    // patient with only one of the two is not a usable record.
    const user = await User.create(
      {
        email,
        passwordHash: await bcrypt.hash(password, 10),
        name,
        phone,
        role: 'patient',
      },
      { transaction }
    );

    const patient = await Patient.create(
      {
        userId: user.id,
        dateOfBirth,
        sex,
        address,
        medicalHistory: medicalHistory || [],
        allergies: allergies || [],
      },
      { transaction }
    );

    await transaction.commit();

    patient.User = user;
    res.status(201).json({ success: true, patient: shape(patient) });
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    next(err);
  }
};

const update = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const patient = await Patient.findByPk(req.params.id, { transaction });
    if (!patient) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Patient not found' });
    }

    const { name, phone } = req.body;
    const { dateOfBirth, sex, address, medicalHistory, allergies } = req.body;

    // Demographics straddle both tables, so the edit runs in one transaction
    // and cannot half-apply. Only the fields actually sent are touched.
    const profile = { dateOfBirth, sex, address, medicalHistory, allergies };
    Object.entries(profile).forEach(([field, value]) => {
      if (value !== undefined) patient[field] = value;
    });
    await patient.save({ transaction });

    if (name !== undefined || phone !== undefined) {
      const user = await User.findByPk(patient.userId, { transaction });
      if (user) {
        if (name !== undefined) user.name = name;
        if (phone !== undefined) user.phone = phone;
        await user.save({ transaction });
      }
    }

    await transaction.commit();

    const saved = await Patient.findByPk(patient.id, {
      include: { model: User, attributes: USER_FIELDS },
    });
    res.json({ success: true, patient: shape(saved) });
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const patient = await Patient.findByPk(req.params.id);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    // Soft delete. The profile stops resolving, which is what removes the
    // patient's own access, while the appointments and prescriptions pointing
    // at this id stay readable.
    await patient.destroy();

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

module.exports = { list, getById, create, update, remove };
