require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const { connectMySQL, sequelize } = require('../src/config/mysql');
const { User, Patient, Appointment, Prescription, syncModels } = require('../src/models/mysql');
const { connectMongoDB } = require('../src/config/mongodb');
const ClinicalNote = require('../src/models/mongodb/ClinicalNote');
const AISummary = require('../src/models/mongodb/AISummary');
const ReminderDispatch = require('../src/models/mongodb/ReminderDispatch');

const PASSWORD = 'Password123!';

// Demographic and clinical seed for the six patients, using the names from the
// Figma designs so the screens match the mockups. `today` is the hour/minute of
// an appointment scheduled for the current day; past visits are generated below.
const PATIENTS = [
  { name: 'Elias Tobias', sex: 'Male', dateOfBirth: '1998-03-14',
    address: '200 Lacewood Dr.', phone: '(902) 555-0101',
    conditions: ['Seasonal allergies', 'Topical eczema'],
    allergies: ['Penicillin'], today: [11, 45], reason: 'Chest pain',
    rx: { medication: 'Desloratadine', dosage: '5mg', frequency: 'once daily', route: 'oral', duration: '30 days' } },
  { name: 'Sam Smith', sex: 'Male', dateOfBirth: '1985-07-02',
    address: '15 Robie St.', phone: '(902) 555-0102',
    conditions: ['Viral infection'], allergies: [],
    today: [12, 30], reason: 'Viral infection' },
  { name: 'Nafisah Nuabh', sex: 'Female', dateOfBirth: '1991-11-20',
    address: '88 Quinpool Rd.', phone: '(902) 555-0103',
    conditions: ['Hypertension'], allergies: ['Sulfa drugs'],
    today: [13, 15], reason: 'Routine checkup',
    rx: { medication: 'Lisinopril', dosage: '10mg', frequency: 'once daily', route: 'oral', duration: '90 days' } },
  { name: 'Tom Hollander', sex: 'Male', dateOfBirth: '1972-01-09',
    address: '3 South St.', phone: '(902) 555-0104',
    conditions: ['Type 2 Diabetes', 'High cholesterol'], allergies: [],
    today: [13, 45], reason: 'Broken bone',
    rx: { medication: 'Metformin', dosage: '500mg', frequency: 'twice daily', route: 'oral', duration: '90 days' } },
  { name: 'Sameera Said', sex: 'Female', dateOfBirth: '2001-05-30',
    address: '410 Spring Garden Rd.', phone: '(902) 555-0105',
    conditions: ['Asthma'], allergies: ['Latex'],
    reason: 'Prescription refill' },
  { name: 'Peter Parker', sex: 'Male', dateOfBirth: '1996-08-18',
    address: '20 Gottingen St.', phone: '(902) 555-0106',
    conditions: [], allergies: ['Ibuprofen'],
    reason: 'Follow-up' },
];

const emailFor = (name) => `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`;

const daysAgo = (n, hour = 10, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d;
};

const todayAt = (hour, minute) => {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
};

const clearAll = async () => {
  await Prescription.destroy({ where: {} });
  await Appointment.destroy({ where: {} });
  // Patients are soft-deleted by default, so the reset asks for a real delete —
  // otherwise re-seeding would pile up hidden rows behind the new ones.
  await Patient.destroy({ where: {}, force: true });
  await User.destroy({ where: {} });
  await ClinicalNote.deleteMany({});
  await AISummary.deleteMany({});
  // Reminders are keyed on appointment ids that are about to disappear; leaving
  // them behind would suppress reminders for whatever reuses those ids.
  await ReminderDispatch.deleteMany({});
};

const seed = async () => {
  await connectMySQL();
  await syncModels();
  await connectMongoDB();

  console.log('Clearing existing data');
  await clearAll();

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  console.log('Creating staff accounts');
  const clinician = await User.create({
    email: 'dr.kuteishi@intellicare.ca', passwordHash, role: 'clinician',
    name: 'Mariam Kuteishi', phone: '(902) 111-1111',
  });
  await User.create({
    email: 'admin@intellicare.ca', passwordHash, role: 'admin',
    name: 'Alex Adams', phone: '(902) 222-2222',
  });

  console.log('Creating patients, appointments, prescriptions, and notes');
  let notes = 0;
  let prescriptions = 0;
  let appointments = 0;

  for (const p of PATIENTS) {
    const user = await User.create({
      email: emailFor(p.name), passwordHash, role: 'patient', name: p.name, phone: p.phone,
    });
    const patient = await Patient.create({
      userId: user.id, sex: p.sex, dateOfBirth: p.dateOfBirth, address: p.address,
      medicalHistory: p.conditions, allergies: p.allergies,
    });

    // A completed past appointment, with a note recorded against it.
    const past = await Appointment.create({
      patientId: patient.id, clinicianId: clinician.id,
      scheduledAt: daysAgo(45, 9, 30), status: 'completed', reason: p.reason,
    });
    appointments += 1;
    await ClinicalNote.create({
      appointmentId: past.id, patientId: patient.id, authorId: clinician.id,
      body: `Patient seen for ${p.reason.toLowerCase()}. Assessment recorded and plan discussed.`,
    });
    notes += 1;

    // A prescription issued at that visit, where the patient has one.
    if (p.rx) {
      await Prescription.create({
        patientId: patient.id, clinicianId: clinician.id, appointmentId: past.id, ...p.rx,
      });
      prescriptions += 1;
    }

    // An upcoming appointment today for the patients shown on the dashboard.
    if (p.today) {
      await Appointment.create({
        patientId: patient.id, clinicianId: clinician.id,
        scheduledAt: todayAt(p.today[0], p.today[1]), status: 'scheduled', reason: p.reason,
      });
      appointments += 1;
    }
  }

  // One pre-appointment AI summary, for the first patient's upcoming visit.
  const elias = await Patient.findOne({ include: { model: User, where: { name: 'Elias Tobias' } } });
  const eliasUpcoming = await Appointment.findOne({
    where: { patientId: elias.id, status: 'scheduled' },
  });
  await AISummary.create({
    patientId: elias.id, appointmentId: eliasUpcoming.id, finalized: false,
    preSummary:
      'Active conditions: seasonal allergies, topical eczema. Allergic to penicillin. '
      + 'Currently on desloratadine 5mg daily. Presenting today with chest pain; no prior '
      + 'cardiac history on file.',
  });

  console.log(
    `\nSeed complete: 2 staff, ${PATIENTS.length} patients, ${appointments} appointments, `
    + `${prescriptions} prescriptions, ${notes} notes, 1 AI summary`
  );
  console.log(`  Clinician: dr.kuteishi@intellicare.ca / ${PASSWORD}`);
  console.log(`  Admin:     admin@intellicare.ca / ${PASSWORD}`);
  console.log(`  Patient:   elias.tobias@example.com / ${PASSWORD}`);

  await sequelize.close();
  await mongoose.connection.close();
};

seed().catch(async (err) => {
  console.error(err);
  await sequelize.close().catch(() => {});
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
