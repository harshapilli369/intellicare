const { getModel } = require('../config/gemini');
const AISummary = require('../models/mongodb/AISummary');

const PRE_APPOINTMENT_PROMPT = (context) => `
You are a clinical decision support assistant. Based on the patient information below,
produce a concise pre-appointment brief for the clinician.

The brief should highlight:
- Active conditions and chronic illnesses
- Current medications and recent prescription changes
- Outstanding follow-ups from previous visits
- New information submitted by the patient since the last encounter
- Any allergies or relevant risk factors

Keep the tone clinical and concise. Use bullet points. Maximum 300 words.

Patient Information:
${JSON.stringify(context, null, 2)}
`.trim();

const POST_APPOINTMENT_CLINICIAN_PROMPT = (context) => `
You are a clinical documentation assistant. Based on the encounter information below,
produce a detailed post-appointment summary for the clinical record.

The summary should cover:
- Chief complaint and presenting symptoms
- Clinical assessment and diagnostic reasoning
- Treatment plan and interventions
- Prescriptions issued
- Follow-up actions and referrals
- Any outstanding concerns

Use clinical language. Structure the output with clear headings. Maximum 400 words.

Encounter Information:
${JSON.stringify(context, null, 2)}
`.trim();

const POST_APPOINTMENT_PATIENT_PROMPT = (context) => `
You are a patient communication assistant. Based on the encounter information below,
write a simple and friendly summary for the patient.

The summary should explain:
- What was discussed during the visit
- What the diagnosis or concern is (in plain language)
- What medications were prescribed and why
- What the patient needs to do next
- When to follow up or seek further care

Avoid complex medical terminology. If you must use a medical term, briefly explain it.
Write in second person ("you"). Maximum 250 words.

Encounter Information:
${JSON.stringify(context, null, 2)}
`.trim();

const validateResponse = (text) => {
  if (!text || typeof text !== 'string') return false;
  if (text.trim().length < 20) return false;
  return true;
};

const callGemini = async (prompt) => {
  const model = getModel();
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  if (!validateResponse(text)) throw new Error('Invalid response from Gemini');
  return text.trim();
};

const getCachedSummary = async (appointmentId) => {
  return AISummary.findOne({ appointmentId });
};

const generatePreSummary = async ({ patientId, appointmentId, context }) => {
  const existing = await getCachedSummary(appointmentId);
  if (existing?.preSummary) {
    return { summary: existing.preSummary, cached: true };
  }

  const inputHash = AISummary.hashInput(context);
  const summary = await callGemini(PRE_APPOINTMENT_PROMPT(context));

  await AISummary.findOneAndUpdate(
    { appointmentId },
    { patientId, appointmentId, preSummary: summary, inputHash },
    { upsert: true, new: true }
  );

  return { summary, cached: false };
};

const generatePostSummary = async ({ patientId, appointmentId, context }) => {
  const existing = await getCachedSummary(appointmentId);
  if (existing?.clinicianSummary && existing?.patientSummary) {
    return {
      clinicianSummary: existing.clinicianSummary,
      patientSummary: existing.patientSummary,
      cached: true,
    };
  }

  const inputHash = AISummary.hashInput(context);
  const [clinicianSummary, patientSummary] = await Promise.all([
    callGemini(POST_APPOINTMENT_CLINICIAN_PROMPT(context)),
    callGemini(POST_APPOINTMENT_PATIENT_PROMPT(context)),
  ]);

  await AISummary.findOneAndUpdate(
    { appointmentId },
    { patientId, appointmentId, clinicianSummary, patientSummary, inputHash },
    { upsert: true, new: true }
  );

  return { clinicianSummary, patientSummary, cached: false };
};

const finalizeSummary = async (appointmentId, edits = {}) => {
  const summary = await AISummary.findOneAndUpdate(
    { appointmentId },
    { ...edits, finalized: true },
    { new: true }
  );
  if (!summary) throw new Error('Summary not found');
  return summary;
};

const getSummaryByAppointment = async (appointmentId) => {
  return AISummary.findOne({ appointmentId });
};

const getPatientSummaries = async (patientId) => {
  return AISummary.find({ patientId, finalized: true }).sort({ createdAt: -1 });
};

module.exports = {
  generatePreSummary,
  generatePostSummary,
  finalizeSummary,
  getSummaryByAppointment,
  getPatientSummaries,
};
