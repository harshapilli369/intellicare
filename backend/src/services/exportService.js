const { stringify } = require('csv-stringify/sync');
const PDFDocument = require('pdfkit');

const { Patient, User, Appointment, Prescription } = require('../models/mysql');
const ClinicalNote = require('../models/mongodb/ClinicalNote');
const AISummary = require('../models/mongodb/AISummary');

const USER_FIELDS = ['id', 'name', 'email', 'phone'];

const formatDate = (value) => (value ? new Date(value).toISOString() : '');

// Assembles the full chart for one patient: demographics plus every
// appointment, prescription, clinical note, and AI summary on record.
//
// `includeClinicalNotes` gates the raw clinician notes and the unfinalized /
// clinician-facing side of AI summaries. The app already treats clinical notes
// as clinician-only elsewhere (see noteRoutes) and gives patients the
// plain-language summary instead — a patient's own export follows the same
// line, so it carries their demographics, visits, prescriptions, and finalized
// patient-facing summaries, but not the clinician's private note text.
const buildChart = async (patientId, { includeClinicalNotes }) => {
  const patient = await Patient.findByPk(patientId, {
    include: { model: User, attributes: USER_FIELDS },
  });
  if (!patient) return null;

  const [appointments, prescriptions, summaries, notes] = await Promise.all([
    Appointment.findAll({ where: { patientId }, order: [['scheduledAt', 'DESC']] }),
    Prescription.findAll({ where: { patientId }, order: [['createdAt', 'DESC']] }),
    includeClinicalNotes
      ? AISummary.find({ patientId }).sort({ createdAt: -1 })
      : AISummary.find({ patientId, finalized: true }).sort({ createdAt: -1 }),
    includeClinicalNotes
      ? ClinicalNote.find({ patientId }).sort({ createdAt: 1 })
      : Promise.resolve([]),
  ]);

  return {
    demographics: {
      id: patient.id,
      name: patient.User?.name || '',
      email: patient.User?.email || '',
      phone: patient.User?.phone || '',
      dateOfBirth: patient.dateOfBirth || '',
      sex: patient.sex || '',
      address: patient.address || '',
      healthCardNumber: patient.healthCardNumber || '',
      medicalHistory: patient.medicalHistory || [],
      allergies: patient.allergies || [],
    },
    appointments: appointments.map((a) => ({
      id: a.id,
      scheduledAt: formatDate(a.scheduledAt),
      status: a.status,
      reason: a.reason || '',
      clinicianId: a.clinicianId,
    })),
    prescriptions: prescriptions.map((p) => ({
      id: p.id,
      medication: p.medication,
      dosage: p.dosage || '',
      frequency: p.frequency || '',
      route: p.route || '',
      duration: p.duration || '',
      issuedOn: formatDate(p.createdAt),
      appointmentId: p.appointmentId,
    })),
    notes: notes.map((n) => ({
      id: n._id.toString(),
      appointmentId: n.appointmentId,
      authorId: n.authorId,
      body: n.body,
      createdAt: formatDate(n.createdAt),
    })),
    summaries: summaries.map((s) => ({
      id: s._id.toString(),
      appointmentId: s.appointmentId,
      finalized: s.finalized,
      ...(includeClinicalNotes
        ? { preSummary: s.preSummary || '', clinicianSummary: s.clinicianSummary || '' }
        : {}),
      patientSummary: s.patientSummary || '',
      createdAt: formatDate(s.createdAt),
    })),
  };
};

const toJSON = (chart) => JSON.stringify(chart, null, 2);

// CSV has no notion of nested sections, so the chart is written as a sequence
// of small tables, one per section, separated by a blank line and a heading.
// Empty sections still print their heading, so the shape of a full chart
// export is the same whether or not a patient has data in every category.
const toCSV = (chart) => {
  const blocks = [];

  const demoRows = Object.entries(chart.demographics).map(([key, value]) => [
    key,
    Array.isArray(value) ? value.join('; ') : String(value ?? ''),
  ]);
  blocks.push('DEMOGRAPHICS');
  blocks.push(stringify(demoRows, { header: false }));

  const table = (title, rows) => {
    blocks.push('');
    blocks.push(title.toUpperCase());
    if (rows.length === 0) {
      blocks.push('(none)');
      return;
    }
    const columns = Object.keys(rows[0]);
    blocks.push(
      stringify(rows, {
        header: true,
        columns,
        cast: { boolean: (v) => (v ? 'true' : 'false') },
      })
    );
  };

  table('appointments', chart.appointments);
  table('prescriptions', chart.prescriptions);
  table('notes', chart.notes);
  table('summaries', chart.summaries);

  return blocks.join('\n');
};

const toPDF = (chart) => {
  const doc = new PDFDocument({ margin: 50 });

  doc.fontSize(18).text('Patient Chart', { underline: true });
  doc.moveDown();

  doc.fontSize(14).text('Demographics');
  doc.fontSize(10);
  const d = chart.demographics;
  doc.text(`Name: ${d.name}`);
  doc.text(`Email: ${d.email}`);
  doc.text(`Phone: ${d.phone}`);
  doc.text(`Date of birth: ${d.dateOfBirth}`);
  doc.text(`Sex: ${d.sex}`);
  doc.text(`Address: ${d.address}`);
  doc.text(`Health card number: ${d.healthCardNumber}`);
  doc.text(`Medical history: ${d.medicalHistory.join(', ') || 'None recorded'}`);
  doc.text(`Allergies: ${d.allergies.join(', ') || 'None recorded'}`);
  doc.moveDown();

  const section = (title, rows, renderRow) => {
    doc.fontSize(14).text(title);
    doc.fontSize(10);
    if (rows.length === 0) {
      doc.text('None recorded.');
    } else {
      rows.forEach((row) => {
        renderRow(row);
        doc.moveDown(0.3);
      });
    }
    doc.moveDown();
  };

  section('Appointments', chart.appointments, (a) => {
    doc.text(`${a.scheduledAt} — ${a.status}${a.reason ? ` — ${a.reason}` : ''}`);
  });

  section('Prescriptions', chart.prescriptions, (p) => {
    doc.text(
      `${p.medication} ${p.dosage || ''} — ${p.frequency || ''} — issued ${p.issuedOn}`.replace(
        /\s+/g,
        ' '
      )
    );
  });

  section('Clinical notes', chart.notes, (n) => {
    doc.text(`${n.createdAt}:`);
    doc.text(n.body, { indent: 10 });
  });

  section('AI summaries', chart.summaries, (s) => {
    doc.text(`Appointment ${s.appointmentId} (${s.finalized ? 'finalized' : 'draft'}):`);
    if (s.clinicianSummary) doc.text(`Clinician summary: ${s.clinicianSummary}`, { indent: 10 });
    if (s.patientSummary) doc.text(`Patient summary: ${s.patientSummary}`, { indent: 10 });
  });

  doc.end();
  return doc;
};

module.exports = { buildChart, toJSON, toCSV, toPDF };
