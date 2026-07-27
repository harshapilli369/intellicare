const aiService = require('../services/aiService');
const { buildPatientContext } = require('../services/clinicalContext');
const ClinicalNote = require('../models/mongodb/ClinicalNote');

// TODO: replaced for post-appointment in #20.
const buildMockContext = (appointmentId) => ({
  patientName: 'Test Patient',
  dateOfBirth: '1980-01-01',
  medicalHistory: ['Hypertension', 'Type 2 Diabetes'],
  medications: ['Metformin 500mg', 'Lisinopril 10mg'],
  allergies: ['Penicillin'],
  previousNotes: ['Patient reported fatigue at last visit. BP was 140/90.'],
  intakeForm: { symptoms: 'Headache and dizziness for 3 days', severity: 'moderate' },
  appointmentReason: 'Follow-up',
});

const generatePreSummary = async (req, res, next) => {
  try {
    const appointmentId = Number(req.params.appointmentId);

    const built = await buildPatientContext(appointmentId);
    if (!built) return res.status(404).json({ message: 'Appointment not found' });

    const result = await aiService.generatePreSummary({
      patientId: built.patientId,
      appointmentId,
      context: built.context,
    });

    res.json({ success: true, summary: result.summary, cached: result.cached });
  } catch (err) {
    next(err);
  }
};

const generatePostSummary = async (req, res, next) => {
  try {
    const appointmentId = Number(req.params.appointmentId);

    const built = await buildPatientContext(appointmentId);
    if (!built) return res.status(404).json({ message: 'Appointment not found' });

    // The encounter notes drive the post-appointment summary: those submitted
    // with the request, or the notes already saved against this appointment.
    let clinicianNotes = req.body.clinicianNotes;
    if (!clinicianNotes) {
      const notes = await ClinicalNote.find({ appointmentId }).sort({ createdAt: 1 });
      clinicianNotes = notes.map((note) => note.body).join('\n');
    }

    const result = await aiService.generatePostSummary({
      patientId: built.patientId,
      appointmentId,
      context: { ...built.context, clinicianNotes },
    });

    res.json({
      success: true,
      clinicianSummary: result.clinicianSummary,
      patientSummary: result.patientSummary,
      cached: result.cached,
    });
  } catch (err) {
    next(err);
  }
};

const getSummaryByAppointment = async (req, res, next) => {
  try {
    const { appointmentId } = req.params;
    const summary = await aiService.getSummaryByAppointment(Number(appointmentId));
    if (!summary) return res.status(404).json({ message: 'No summary found for this appointment' });
    res.json({ success: true, summary });
  } catch (err) {
    next(err);
  }
};

const finalizeSummary = async (req, res, next) => {
  try {
    const { appointmentId } = req.params;
    const edits = req.body;
    const summary = await aiService.finalizeSummary(Number(appointmentId), edits);
    res.json({ success: true, summary });
  } catch (err) {
    next(err);
  }
};

const getPatientSummaries = async (req, res, next) => {
  try {
    const { patientId } = req.params;
    const summaries = await aiService.getPatientSummaries(Number(patientId));
    res.json({ success: true, summaries });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  generatePreSummary,
  generatePostSummary,
  getSummaryByAppointment,
  finalizeSummary,
  getPatientSummaries,
};
