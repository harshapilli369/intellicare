const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');

const { sequelize } = require('../config/mysql');
const { User, Patient, Appointment, Prescription } = require('../models/mysql');
const AuditLog = require('../models/mongodb/AuditLog');
const exportService = require('../services/exportService');
const importService = require('../services/importService');
const invitationService = require('../services/invitationService');
const reminderService = require('../services/reminderService');
const ReminderPreference = require('../models/mongodb/ReminderPreference');
const { patientProfileFor } = require('../middleware/ownership');

// The account columns a patient record is allowed to expose. Never includes the
// password hash.
const USER_FIELDS = ['id', 'name', 'email', 'phone'];

// How much history a chart carries. Enough to fill the lists the profile screen
// draws, with room to spare; not the whole of a long record, which nobody reads
// from a summary screen and which grows without limit. The full history is
// still available - the export returns everything, and the appointment list
// takes filters.
const CHART_HISTORY_LIMIT = 25;

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
    //
    // Bounded, and counted alongside. The screen shows a recent-history list
    // and a medication list, neither of which is scrolled to the end of a long
    // record - but this returned every row a patient had ever accumulated. On
    // a well-used record that was a hundred and twenty kilobytes of JSON to
    // render a dozen lines, and it grew for ever. The count is returned too, so
    // the screen can say how much more there is rather than silently implying
    // that this is all of it.
    const [prescriptions, prescriptionCount, appointments, appointmentCount] = await Promise.all([
      Prescription.findAll({
        where: { patientId: patient.id },
        order: [['createdAt', 'DESC']],
        limit: CHART_HISTORY_LIMIT,
      }),
      Prescription.count({ where: { patientId: patient.id } }),
      Appointment.findAll({
        where: { patientId: patient.id },
        order: [['scheduledAt', 'DESC']],
        limit: CHART_HISTORY_LIMIT,
      }),
      Appointment.count({ where: { patientId: patient.id } }),
    ]);

    res.json({
      success: true,
      patient: {
        ...shape(patient),
        prescriptions,
        appointments,
        totals: { prescriptions: prescriptionCount, appointments: appointmentCount },
      },
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

    // No password given means the patient is invited to choose their own, which
    // is the ordinary way to onboard somebody: nobody else ever knows it, and
    // there is nothing to relay. A password is only set here when an
    // administrator deliberately supplies one - a patient at the desk who wants
    // it done there and then.
    //
    // Until they redeem the invitation the account holds an unusable random
    // secret, so it cannot be signed into by anybody, including whoever created
    // it.
    const invited = !password;

    // The sign-in account and the clinical profile are written together: a
    // patient with only one of the two is not a usable record.
    const user = await User.create(
      {
        email,
        passwordHash: await bcrypt.hash(
          password || crypto.randomBytes(32).toString('base64url'),
          10
        ),
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

    // Issued inside the transaction, so a patient is never left created without
    // the means to get in.
    const invitation = invited ? await invitationService.issue(user.id, { transaction }) : null;

    await transaction.commit();

    // Only after the row is committed - a message cannot be recalled if the
    // transaction then rolls back.
    const delivery = invitation ? await invitationService.send(user, invitation) : null;

    patient.User = user;
    res.status(201).json({
      success: true,
      patient: shape(patient),
      invitation: invitation
        ? { link: invitation.link, expiresAt: invitation.expiresAt, delivery }
        : null,
    });
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

// What a patient may correct about themselves: how the clinic reaches them.
//
// Deliberately its own endpoint rather than a role-gated branch of `update`.
// The fields a patient must never set - date of birth, sex, health card number,
// medical history, allergies - are not merely filtered here, they are never
// read from the body at all. A whitelist inside a shared handler is one
// forgotten line away from letting a patient rewrite their own chart, and this
// codebase has already had one flaw of exactly that shape.
//
// Identity stays with staff: a name, a birth date and a health card number are
// what a patient is matched on at reception, so correcting those is a desk
// conversation, not a form.
const updateOwnDetails = async (req, res, next) => {
  try {
    const patient = await Patient.findByPk(req.params.id);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    const { phone, address } = req.body;
    if (phone === undefined && address === undefined) {
      return res.status(400).json({ message: 'Send a phone number or an address to change' });
    }

    const before = { phone: null, address: patient.address };

    if (address !== undefined) patient.address = address;
    await patient.save();

    if (phone !== undefined) {
      const user = await User.findByPk(patient.userId);
      if (user) {
        before.phone = user.phone;
        user.phone = phone;
        await user.save();
      }
    }

    // A patient changing their own record is as worth recording as staff
    // exporting it, and for the same reason: somebody may need to know later
    // who changed what.
    await AuditLog.create({
      action: 'update',
      patientId: patient.id,
      performedBy: req.user.id,
      performedByRole: req.user.role,
      detail: {
        fields: Object.keys({ ...(phone !== undefined && { phone }), ...(address !== undefined && { address }) }),
        before,
      },
    });

    const saved = await Patient.findByPk(patient.id, {
      include: { model: User, attributes: USER_FIELDS },
    });
    res.json({ success: true, patient: shape(saved) });
  } catch (err) {
    next(err);
  }
};

// When and how a patient wants to be reminded. Absent means the clinic's own
// schedule, so a patient who has never touched this reads back the default
// rather than an empty form.
const getReminderPreferences = async (req, res, next) => {
  try {
    const profile = await patientProfileFor(req.user);
    if (!profile) return res.status(403).json({ message: 'Forbidden' });

    const stored = await ReminderPreference.findOne({ patientId: profile.id });
    const schedule = reminderService.scheduleFor(stored);

    res.json({
      success: true,
      preferences: {
        offsetsHours: schedule.offsets,
        email: schedule.email,
        inApp: schedule.inApp,
        // So the screen can say whether this is theirs or the clinic's.
        usingClinicDefault: !stored,
        clinicDefault: reminderService.offsets(),
      },
    });
  } catch (err) {
    next(err);
  }
};

const setReminderPreferences = async (req, res, next) => {
  try {
    const profile = await patientProfileFor(req.user);
    if (!profile) return res.status(403).json({ message: 'Forbidden' });

    const { offsetsHours, email, inApp } = req.body;

    // Largest first, matching how the clinic default is read, and de-duplicated
    // so asking twice for the same hour does not send two reminders.
    const offsets = [...new Set(offsetsHours.map(Number))].sort((a, b) => b - a);

    const saved = await ReminderPreference.findOneAndUpdate(
      { patientId: profile.id },
      { patientId: profile.id, offsetsHours: offsets, email: email !== false, inApp: inApp !== false },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({
      success: true,
      preferences: {
        offsetsHours: saved.offsetsHours,
        email: saved.email,
        inApp: saved.inApp,
        usingClinicDefault: false,
        clinicDefault: reminderService.offsets(),
      },
    });
  } catch (err) {
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

// Full chart export: demographics, appointments, prescriptions, notes, and AI
// summaries, in CSV, JSON, or PDF. Access is enforced upstream — staff export
// any patient, a patient only their own (requireOwnPatient on the route) —
// this only decides what the file contains and records that it happened.
const exportChart = async (req, res, next) => {
  try {
    const patientId = Number(req.params.id);
    const format = (req.query.format || 'json').toLowerCase();

    if (!['csv', 'json', 'pdf'].includes(format)) {
      return res.status(400).json({ message: 'format must be csv, json, or pdf' });
    }

    // Raw clinical notes and the clinician-facing side of a summary are staff
    // material; a printable PDF is likewise a staff tool for handing someone a
    // physical copy, not something a patient's self-service export produces.
    const isStaff = req.user.role === 'clinician' || req.user.role === 'admin';
    if (format === 'pdf' && !isStaff) {
      return res.status(403).json({ message: 'PDF export is available to clinicians and admins' });
    }

    const chart = await exportService.buildChart(patientId, { includeClinicalNotes: isStaff });
    if (!chart) return res.status(404).json({ message: 'Patient not found' });

    await AuditLog.create({
      action: 'export',
      patientId,
      performedBy: req.user.id,
      performedByRole: req.user.role,
      format,
      detail: {
        appointments: chart.appointments.length,
        prescriptions: chart.prescriptions.length,
        notes: chart.notes.length,
        summaries: chart.summaries.length,
      },
    });

    const filename = `patient-${patientId}-chart.${format}`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      return res.send(exportService.toJSON(chart));
    }

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      return res.send(exportService.toCSV(chart));
    }

    res.setHeader('Content-Type', 'application/pdf');
    const doc = exportService.toPDF(chart);
    return doc.pipe(res);
  } catch (err) {
    next(err);
  }
};

// Bulk create from an uploaded CSV or JSON file. Every row is validated and
// reported on individually — a file that is mostly good still imports the
// good rows, with the bad ones named by line number rather than aborting the
// whole batch.
const importPatients = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Upload a CSV or JSON file under the "file" field' });
    }

    const format = req.file.originalname.toLowerCase().endsWith('.json') ? 'json' : 'csv';

    let rows;
    try {
      rows = importService.parseRows(req.file.buffer, format);
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }

    if (rows.length === 0) {
      return res.status(400).json({ message: 'That file has no rows to import' });
    }

    const summary = await importService.importPatients(rows);

    // Creating patients in bulk is as auditable as exporting one, and the log
    // already provides for it. Not tied to a single patient, so patientId is
    // left null.
    await AuditLog.create({
      action: 'import',
      performedBy: req.user.id,
      performedByRole: req.user.role,
      detail: {
        filename: req.file.originalname,
        totalRows: summary.totalRows,
        inserted: summary.inserted,
        updated: summary.updated,
        rejected: summary.rejected,
      },
    });

    res.json({ success: true, ...summary });
  } catch (err) {
    next(err);
  }
};

// Issues a patient a fresh invitation to set their password, and emails it.
// Any earlier unredeemed invitation stops working, so a link that has gone
// astray cannot be used by whoever ended up with it.
const invitePatient = async (req, res, next) => {
  try {
    const patient = await Patient.findByPk(req.params.id, {
      include: [{ model: User, attributes: ['id', 'name', 'email'] }],
    });
    if (!patient || !patient.User) return res.status(404).json({ message: 'Patient not found' });

    const invitation = await invitationService.issue(patient.User.id);
    const delivery = await invitationService.send(patient.User, invitation);

    await AuditLog.create({
      action: 'invite',
      patientId: patient.id,
      performedBy: req.user.id,
      performedByRole: req.user.role,
      detail: { delivery, expiresAt: invitation.expiresAt },
    });

    res.json({
      success: true,
      invitation: { link: invitation.link, expiresAt: invitation.expiresAt, delivery },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  list,
  getById,
  create,
  update,
  updateOwnDetails,
  remove,
  exportChart,
  importPatients,
  invitePatient,
  getReminderPreferences,
  setReminderPreferences,
};
