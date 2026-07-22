const aiService = require('../services/aiService');

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
    const { appointmentId } = req.params;

    // TODO: replace mock with real data once patient/appointment modules are ready
    const context = buildMockContext(appointmentId);

    const result = await aiService.generatePreSummary({
      patientId: context.patientId || 1,
      appointmentId: Number(appointmentId),
      context,
    });

    res.json({ success: true, summary: result.summary, cached: result.cached });
  } catch (err) {
    next(err);
  }
};

const generatePostSummary = async (req, res, next) => {
  try {
    const { appointmentId } = req.params;

    // TODO: replace mock with real data once notes/appointment modules are ready
    const context = {
      ...buildMockContext(appointmentId),
      clinicianNotes: req.body.clinicianNotes || 'Patient presented with headache and dizziness. BP 150/95. Adjusted Lisinopril dosage.',
    };

    const result = await aiService.generatePostSummary({
      patientId: context.patientId || 1,
      appointmentId: Number(appointmentId),
      context,
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
