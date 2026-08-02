const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { parse } = require('csv-parse/sync');

const { sequelize } = require('../config/mysql');
const { User, Patient } = require('../models/mysql');
const invitationService = require('./invitationService');

const VALID_SEX = ['Male', 'Female', 'Other'];

// A list field may arrive as a real array (JSON) or as a delimited string
// (CSV cell), e.g. "Penicillin; Latex" or "Penicillin,Latex".
const toList = (value) => {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value !== 'string' || !value.trim()) return [];
  return value
    .split(/[;,]/)
    .map((v) => v.trim())
    .filter(Boolean);
};

// Reads the uploaded buffer into a plain array of row objects, regardless of
// whether it was sent as CSV or JSON. Throws with a message meant to be shown
// back to the admin as-is, since a malformed file never reaches row validation.
const parseRows = (buffer, format) => {
  const text = buffer.toString('utf8');

  if (format === 'json') {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('That file is not valid JSON');
    }
    const rows = Array.isArray(data) ? data : data.patients;
    if (!Array.isArray(rows)) {
      throw new Error('Expected a JSON array of patients (or an object with a "patients" array)');
    }
    return rows;
  }

  try {
    return parse(text, { columns: true, skip_empty_lines: true, trim: true });
  } catch (err) {
    throw new Error(`That file is not valid CSV: ${err.message}`);
  }
};

// Checks one row against the patient schema. Returns a list of field-level
// errors; an empty list means the row is ready to insert. Does not touch the
// database — cross-row and cross-database checks (duplicate emails) are done
// by the caller, once, across the whole file.
const validateRow = (row) => {
  const errors = [];

  const email = String(row.email || '').trim();
  if (!email) errors.push({ field: 'email', message: 'Email is required' });
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push({ field: 'email', message: 'Email is not a valid address' });
  }

  const name = String(row.name || '').trim();
  if (!name) errors.push({ field: 'name', message: 'Name is required' });

  if (row.password !== undefined && row.password !== '') {
    if (String(row.password).length < 8) {
      errors.push({ field: 'password', message: 'Password must be at least 8 characters' });
    }
  }

  if (row.dateOfBirth !== undefined && row.dateOfBirth !== '') {
    if (Number.isNaN(Date.parse(row.dateOfBirth))) {
      errors.push({ field: 'dateOfBirth', message: 'Date of birth is not a valid date' });
    }
  }

  if (row.sex !== undefined && row.sex !== '' && !VALID_SEX.includes(row.sex)) {
    errors.push({ field: 'sex', message: `Sex must be one of ${VALID_SEX.join(', ')}` });
  }

  if (row.healthCardNumber !== undefined && String(row.healthCardNumber).length > 40) {
    errors.push({ field: 'healthCardNumber', message: 'Health card number is too long' });
  }

  return errors;
};

// A row that brings no password of its own gets an unusable one, and an
// invitation to choose a real one. Nothing here is ever shown to the admin or
// written down: the account cannot be signed into until the patient sets a
// password through their link, which is the point.
const unusablePassword = () => crypto.randomBytes(32).toString('base64url');

// Columns a row may carry that live on the patient's profile, and how to read
// each one out of a cell. A column absent from the file is left alone rather
// than blanked - a file exported with three columns and sent back corrected
// must not erase everything it did not mention.
const PROFILE_COLUMNS = {
  dateOfBirth: (value) => value || null,
  sex: (value) => value || null,
  address: (value) => String(value).trim(),
  healthCardNumber: (value) => String(value).trim(),
  medicalHistory: toList,
  allergies: toList,
};

// Brings an existing patient up to date from a row. Only what the row actually
// carries is touched.
//
// Never the password: a file is not where a password change belongs, and a
// patient who has already set their own must not have it overwritten by an
// administrator re-importing a spreadsheet. Never the role either - that is
// what stops a row promoting an account.
const updateExisting = async ({ userId, patientId }, row) => {
  const transaction = await sequelize.transaction();
  const changed = [];

  try {
    const user = await User.findByPk(userId, { transaction });

    if (row.name !== undefined && String(row.name).trim() !== user.name) {
      user.name = String(row.name).trim();
      changed.push('name');
    }
    if (row.phone !== undefined && String(row.phone).trim() !== (user.phone || '')) {
      user.phone = String(row.phone).trim() || null;
      changed.push('phone');
    }
    if (changed.length > 0) await user.save({ transaction });

    // A patient account with no profile row is possible for anyone registered
    // through public sign-up, so the profile is created rather than assumed.
    let patient = patientId
      ? await Patient.findByPk(patientId, { transaction })
      : await Patient.findOne({ where: { userId }, transaction });

    if (!patient) {
      patient = await Patient.create({ userId }, { transaction });
      changed.push('profile');
    }

    for (const [column, read] of Object.entries(PROFILE_COLUMNS)) {
      if (row[column] === undefined || row[column] === '') continue;

      const value = read(row[column]);
      if (JSON.stringify(patient[column]) !== JSON.stringify(value)) {
        patient[column] = value;
        changed.push(column);
      }
    }
    await patient.save({ transaction });

    await transaction.commit();
    return { patientId: patient.id, changed };
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
};

// Imports a parsed list of rows. Every row is validated first so line numbers
// in the report line up with the source file regardless of what fails later;
// duplicate emails — within the file and against existing accounts — are
// caught in that same pass so a name collision reads the same as any other
// validation error rather than surfacing as a raw database error mid-import.
// Each row that passes is then inserted in its own transaction, so one bad
// row cannot roll back the rows around it.
const importPatients = async (rows) => {
  const seenEmails = new Map(); // lowercase email -> first line it appeared on

  // Everyone already on the books, so a row can be matched to them. Keyed on
  // the address rather than looked up per row, since a file of several hundred
  // would otherwise be several hundred queries.
  //
  // Staff are included on purpose. A row naming a clinician's address is not a
  // patient to update - it is a mistake, and it needs to read as one rather
  // than quietly creating a second account or writing patient fields onto a
  // clinician.
  const accounts = new Map();
  const users = await User.findAll({
    attributes: ['id', 'email', 'role'],
    include: [{ model: Patient, attributes: ['id'], required: false }],
  });

  for (const user of users) {
    accounts.set(user.email.toLowerCase(), {
      userId: user.id,
      role: user.role,
      patientId: user.Patient?.id || null,
    });
  }

  const results = [];
  // Invitations to send once every row has been dealt with, so mail never sits
  // between one patient being created and the next.
  const pending = [];

  for (let i = 0; i < rows.length; i += 1) {
    const line = i + 1; // 1-based, counts data rows only (header excluded)
    const row = rows[i] || {};
    const errors = validateRow(row);

    const email = String(row.email || '').trim().toLowerCase();
    const known = email ? accounts.get(email) : null;

    if (email) {
      if (seenEmails.has(email)) {
        errors.push({
          field: 'email',
          message: `Duplicate of line ${seenEmails.get(email)} in this file`,
        });
      } else {
        seenEmails.set(email, line);
      }

      // An address already in use by staff is not a patient to bring up to
      // date, and must not become one.
      if (known && known.role !== 'patient') {
        errors.push({
          field: 'email',
          message: `This address belongs to a staff account (${known.role})`,
        });
      }
    }

    if (errors.length > 0) {
      results.push({ line, email: row.email || '', status: 'rejected', errors });
      continue;
    }

    // A row naming somebody already on the books brings their record up to
    // date instead of being refused - which is what a file exported, corrected
    // and sent back is for.
    if (known) {
      try {
        const updated = await updateExisting(known, row);
        results.push({ line, email: row.email, status: 'updated', ...updated });
      } catch (err) {
        results.push({
          line,
          email: row.email || '',
          status: 'rejected',
          errors: [{ field: null, message: err.message || 'Could not update this patient' }],
        });
      }
      continue;
    }

    // A file may carry its own password, in which case the patient already has
    // one and needs no invitation. Otherwise the account is left unusable until
    // they set one themselves.
    const invited = !row.password;
    const password = row.password || unusablePassword();

    const transaction = await sequelize.transaction();
    try {
      const user = await User.create(
        {
          email: String(row.email).trim(),
          passwordHash: await bcrypt.hash(String(password), 10),
          name: String(row.name).trim(),
          phone: row.phone ? String(row.phone).trim() : null,
          role: 'patient',
        },
        { transaction }
      );

      const patient = await Patient.create(
        {
          userId: user.id,
          dateOfBirth: row.dateOfBirth || null,
          sex: row.sex || null,
          address: row.address ? String(row.address).trim() : null,
          healthCardNumber: row.healthCardNumber ? String(row.healthCardNumber).trim() : null,
          medicalHistory: toList(row.medicalHistory),
          allergies: toList(row.allergies),
        },
        { transaction }
      );

      // Issued inside the transaction, so a patient is never left created
      // without the means to get in.
      const invitation = invited ? await invitationService.issue(user.id, { transaction }) : null;

      await transaction.commit();

      const record = {
        line,
        email: user.email,
        status: 'inserted',
        patientId: patient.id,
        // The link is shown so an admin can pass it on where mail is not
        // configured. It is not something to write down: the patient record
        // will issue a fresh one whenever it is asked.
        invitation: invitation
          ? { link: invitation.link, expiresAt: invitation.expiresAt, delivery: null }
          : null,
      };
      results.push(record);

      // Queued rather than sent here. Mail is only attempted once the row is
      // committed, since a message cannot be recalled if the transaction then
      // rolls back - and sending them one after another would make a file of
      // fifty patients wait fifty timeouts if the host blocks outbound SMTP.
      if (invitation) pending.push({ record, user, invitation });
    } catch (err) {
      if (!transaction.finished) await transaction.rollback();
      results.push({
        line,
        email: row.email || '',
        status: 'rejected',
        errors: [{ field: null, message: err.message || 'Could not create this patient' }],
      });
    }
  }

  // Every invitation goes out at once, so the whole file costs one round trip
  // rather than one per patient. Settled rather than all, because one
  // unreachable address must not lose the report for everybody else.
  await Promise.allSettled(
    pending.map(async ({ record, user, invitation }) => {
      record.invitation.delivery = await invitationService.send(user, invitation);
    })
  );

  // Counted from what each row actually became, rather than deriving one from
  // the others - with three outcomes rather than two, "everything that is not
  // an insert was rejected" stopped being true.
  const count = (status) => results.filter((r) => r.status === status).length;

  return {
    totalRows: rows.length,
    inserted: count('inserted'),
    updated: count('updated'),
    rejected: count('rejected'),
    results,
  };
};

module.exports = { parseRows, importPatients };
