const { Appointment, Patient, Prescription, User } = require('../models/mysql');
const { MEDICATIONS, findMedication, runsOutOn, isCurrent } = require('../services/prescriptions');

const shape = (prescription) => ({
  id: prescription.id,
  patientId: prescription.patientId,
  clinicianId: prescription.clinicianId,
  appointmentId: prescription.appointmentId,
  medication: prescription.medication,
  dosage: prescription.dosage,
  frequency: prescription.frequency,
  route: prescription.route,
  duration: prescription.duration,
  issuedOn: prescription.createdAt,
  runsOutOn: runsOutOn(prescription),
  current: isCurrent(prescription),
  clinicianName: prescription.clinician?.name,
});

// What may be prescribed, for the form that issues one.
const formulary = (req, res) => {
  res.json({ success: true, medications: MEDICATIONS });
};

const create = async (req, res, next) => {
  try {
    const { patientId, appointmentId, dosage, frequency, route, duration } = req.body;

    const medication = findMedication(req.body.medication);
    if (!medication) {
      return res.status(400).json({
        message: 'That medication is not on the reference list',
        fields: ['medication'],
      });
    }

    if (!(await Patient.findByPk(patientId))) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    // A prescription may name the visit it was written during, but only one the
    // patient actually attended.
    if (appointmentId) {
      const appointment = await Appointment.findByPk(appointmentId);
      if (!appointment) return res.status(404).json({ message: 'Appointment not found' });
      if (appointment.patientId !== patientId) {
        return res
          .status(400)
          .json({ message: 'That appointment belongs to a different patient' });
      }
    }

    const created = await Prescription.create({
      patientId,
      clinicianId: req.user.id,
      appointmentId: appointmentId || null,
      // Stored under the reference spelling rather than however it was typed.
      medication: medication.name,
      dosage,
      frequency,
      route,
      duration,
    });

    const prescription = await Prescription.findByPk(created.id, {
      include: { model: User, as: 'clinician', attributes: ['name'] },
    });

    res.status(201).json({ success: true, prescription: shape(prescription) });
  } catch (err) {
    next(err);
  }
};

// A patient's medication list, newest first, split into what they are taking now
// and what has finished.
const listForPatient = async (req, res, next) => {
  try {
    const prescriptions = await Prescription.findAll({
      where: { patientId: req.params.patientId },
      include: { model: User, as: 'clinician', attributes: ['name'] },
      order: [['createdAt', 'DESC']],
    });

    const shaped = prescriptions.map(shape);

    res.json({
      success: true,
      prescriptions: shaped,
      current: shaped.filter((prescription) => prescription.current),
      past: shaped.filter((prescription) => !prescription.current),
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { formulary, create, listForPatient };
