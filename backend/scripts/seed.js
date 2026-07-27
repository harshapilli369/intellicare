require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const { connectMySQL, sequelize } = require('../src/config/mysql');
const { User, Patient, Appointment, Prescription, syncModels } = require('../src/models/mysql');
const { connectMongoDB } = require('../src/config/mongodb');

const PASSWORD = 'Password123!';

// Demographic and clinical seed for the six patients, using the names from the
// Figma designs so the screens match the mockups.
const PATIENTS = [
  { name: 'Elias Tobias', sex: 'Male', dateOfBirth: '1998-03-14',
    address: '200 Lacewood Dr.', conditions: ['Seasonal allergies', 'Topical eczema'],
    allergies: ['Penicillin'] },
  { name: 'Sam Smith', sex: 'Male', dateOfBirth: '1985-07-02',
    address: '15 Robie St.', conditions: ['Viral infection'], allergies: [] },
  { name: 'Nafisah Nuabh', sex: 'Female', dateOfBirth: '1991-11-20',
    address: '88 Quinpool Rd.', conditions: ['Hypertension'], allergies: ['Sulfa drugs'] },
  { name: 'Tom Hollander', sex: 'Male', dateOfBirth: '1972-01-09',
    address: '3 South St.', conditions: ['Type 2 Diabetes', 'High cholesterol'], allergies: [] },
  { name: 'Sameera Said', sex: 'Female', dateOfBirth: '2001-05-30',
    address: '410 Spring Garden Rd.', conditions: ['Asthma'], allergies: ['Latex'] },
  { name: 'Peter Parker', sex: 'Male', dateOfBirth: '1996-08-18',
    address: '20 Gottingen St.', conditions: [], allergies: ['Ibuprofen'] },
];

const emailFor = (name) => `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`;

const clearAll = async () => {
  // Delete in dependency order so foreign keys are satisfied.
  await Prescription.destroy({ where: {} });
  await Appointment.destroy({ where: {} });
  await Patient.destroy({ where: {} });
  await User.destroy({ where: {} });
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

  console.log('Creating patients');
  const patients = [];
  for (const p of PATIENTS) {
    const user = await User.create({
      email: emailFor(p.name), passwordHash, role: 'patient', name: p.name,
    });
    const patient = await Patient.create({
      userId: user.id, sex: p.sex, dateOfBirth: p.dateOfBirth, address: p.address,
      medicalHistory: p.conditions, allergies: p.allergies,
    });
    patients.push(patient);
  }

  console.log(`\nSeed complete: 2 staff + ${patients.length} patients`);
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
