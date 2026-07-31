import api from './api';

// The clinician's landing screen in one request. Scoped to the signed-in
// clinician by the backend, so it takes no id.
export const getClinicianDashboard = (month) =>
  api.get('/dashboard/clinician', { params: month ? { month } : {} }).then((r) => r.data);
