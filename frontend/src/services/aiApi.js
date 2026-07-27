import api from './api';

// Wrappers for the AI summary endpoints. The frontend never calls Gemini
// directly; every request goes through the backend.
export const getSummary = (appointmentId) =>
  api.get(`/ai/summary/${appointmentId}`).then((r) => r.data.summary);

export const generatePre = (appointmentId) =>
  api.post(`/ai/pre-appointment/${appointmentId}`).then((r) => r.data);

export const generatePost = (appointmentId, clinicianNotes) =>
  api.post(`/ai/post-appointment/${appointmentId}`, { clinicianNotes }).then((r) => r.data);

export const finalizeSummary = (appointmentId, edits) =>
  api.patch(`/ai/summary/${appointmentId}/finalize`, edits).then((r) => r.data.summary);
