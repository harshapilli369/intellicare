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
  healthCardNumber: patient.healthCardNumber,
  medicalHistory: patient.medicalHistory || [],
  allergies: patient.allergies || [],
});

// The directory shows what each patient is currently being seen for, which is
// the reason on their most recent appointment. Read for the whole page in one
// query so the list does not issue a query per row.
const withConditions = async (patients) => {
  if (patients.length === 0) return [];

  const appointments = await Appointment.findAll({
    where: { patientId: { [Op.in]: patients.map((patient) => patient.id) } },
    order: [['scheduledAt', 'DESC']],
  });

  const latest = new Map();
  appointments.forEach((appointment) => {
    if (!latest.has(appointment.patientId)) latest.set(appointment.patientId, appointment);
  });

  return patients.map((patient) => ({
    ...shape(patient),
    condition: latest.get(patient.id)?.reason || null,
  }));
};

const list = async (req, res, next) => {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const search = (req.query.search || '').trim();
    const { sex } = req.query;

    const where = {};
    if (sex) where.sex = sex;

    if (search) {
      const like = { [Op.like]: `%${search}%` };

      // The directory is searched by who the patient is or by what they are
      // being seen for, and that reason lives on the appointment rather than
      // the profile. Resolving the matching ids up front keeps this to one
      // extra query instead of a join that would distort the paged count.
      const byReason = await Appointment.findAll({
        attributes: ['patientId'],
        where: { reason: like },
        group: ['patientId'],
      });

      const matches = [{ '$User.name$': like }, { '$User.email$': like }];
      if (byReason.length) {
        matches.push({ id: { [Op.in]: byReason.map((row) => row.patientId) } });
      }
      where[Op.or] = matches;
    }

    const { rows, count } = await Patient.findAndCountAll({
      where,
      include: { model: User, attributes: USER_FIELDS, required: true },
      order: [[User, 'name', 'ASC']],
      limit,
      offset: (page - 1) * limit,
      // The search reaches into the joined User, so the rows and the count are
      // resolved against the join rather than a subquery over patients alone.
      subQuery: false,
      distinct: true,
    });

    res.json({
      success: true,
      patients: await withConditions(rows),
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
    const { dateOfBirth, sex, address, healthCardNumber, medicalHistory, allergies } = req.body;

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
        healthCardNumber,
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
    const { dateOfBirth, sex, address, healthCardNumber, medicalHistory, allergies } = req.body;

    // Demographics straddle both tables, so the edit runs in one transaction
    // and cannot half-apply. Only the fields actually sent are touched.
    const profile = { dateOfBirth, sex, address, healthCardNumber, medicalHistory, allergies };
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
