const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { parse } = require('csv-parse/sync');

const { sequelize } = require('../config/mysql');
const { User, Patient } = require('../models/mysql');

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

// A password the admin never has to invent by hand for a bulk file. Only
// returned to the caller for rows that did not supply their own, so it can be
// handed to the patient out of band.
const generatePassword = () => crypto.randomBytes(9).toString('base64url');

// Imports a parsed list of rows. Every row is validated first so line numbers
// in the report line up with the source file regardless of what fails later;
// duplicate emails — within the file and against existing accounts — are
// caught in that same pass so a name collision reads the same as any other
// validation error rather than surfacing as a raw database error mid-import.
// Each row that passes is then inserted in its own transaction, so one bad
// row cannot roll back the rows around it.
const importPatients = async (rows) => {
  const seenEmails = new Map(); // lowercase email -> first line it appeared on

  const existing = await User.findAll({
    where: {},
    attributes: ['email'],
  }).then((users) => new Set(users.map((u) => u.email.toLowerCase())));

  const results = [];

  for (let i = 0; i < rows.length; i += 1) {
    const line = i + 1; // 1-based, counts data rows only (header excluded)
    const row = rows[i] || {};
    const errors = validateRow(row);

    const email = String(row.email || '').trim().toLowerCase();
    if (email) {
      if (existing.has(email)) {
        errors.push({ field: 'email', message: 'A user with this email already exists' });
      } else if (seenEmails.has(email)) {
        errors.push({
          field: 'email',
          message: `Duplicate of line ${seenEmails.get(email)} in this file`,
        });
      } else {
        seenEmails.set(email, line);
      }
    }

    if (errors.length > 0) {
      results.push({ line, email: row.email || '', status: 'rejected', errors });
      continue;
    }

    const password = row.password || generatePassword();
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

      await transaction.commit();

      results.push({
        line,
        email: user.email,
        status: 'inserted',
        patientId: patient.id,
        // Only surfaced when it was generated here, so a password supplied by
        // the file itself is never echoed back.
        temporaryPassword: row.password ? undefined : password,
      });
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

  const inserted = results.filter((r) => r.status === 'inserted').length;
  return {
    totalRows: rows.length,
    inserted,
    rejected: rows.length - inserted,
    results,
  };
};

module.exports = { parseRows, importPatients };
