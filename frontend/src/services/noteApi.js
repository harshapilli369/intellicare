import api from './api';

// Wrappers for the clinical notes endpoints. All of them are clinician-only;
// the backend enforces that, and the UI only offers them to clinicians.
export const listNotesForAppointment = (appointmentId) =>
  api.get(`/notes/appointment/${appointmentId}`).then((r) => r.data.notes);

export const listNotesForPatient = (patientId) =>
  api.get(`/notes/patient/${patientId}`).then((r) => r.data.notes);

export const createNote = (appointmentId, body) =>
  api.post('/notes', { appointmentId, body }).then((r) => r.data.note);

export const updateNote = (id, body) => api.patch(`/notes/${id}`, { body }).then((r) => r.data.note);
