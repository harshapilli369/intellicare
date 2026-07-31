import api from './api';

// The clinician's landing screen in one request. Scoped to the signed-in
// clinician by the backend, so it takes no id.
export const getClinicianDashboard = (month) =>
  api.get('/dashboard/clinician', { params: month ? { month } : {} }).then((r) => r.data);

// The patient's own landing screen, including the id of their patient record,
// which the account id is not.
export const getPatientDashboard = () => api.get('/dashboard/patient').then((r) => r.data);
