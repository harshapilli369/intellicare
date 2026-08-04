import api from './api';

// What may be prescribed. Staff only, and the form is built from it rather than
// letting a medication be typed freely.
export const getFormulary = () =>
  api.get('/prescriptions/formulary').then((r) => r.data.medications);

export const createPrescription = (payload) =>
  api.post('/prescriptions', payload).then((r) => r.data.prescription);

export const getPrescription = (id) =>
  api.get(`/prescriptions/${id}`).then((r) => r.data.prescription);

export const listPrescriptionsForPatient = (patientId) =>
  api.get(`/prescriptions/patient/${patientId}`).then((r) => r.data);
