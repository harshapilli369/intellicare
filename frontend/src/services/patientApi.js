import api from './api';

// Wrappers for the patient endpoints. The list is staff-only; a patient may
// read their own profile and nothing else, which the backend enforces.
export const listPatients = ({ page = 1, limit = 10, search = '', sex = '' } = {}) => {
  const params = { page, limit };
  if (search) params.search = search;
  if (sex) params.sex = sex;
  return api.get('/patients', { params }).then((r) => r.data);
};

export const getPatient = (id) => api.get(`/patients/${id}`).then((r) => r.data.patient);

export const createPatient = (payload) =>
  api.post('/patients', payload).then((r) => r.data.patient);

export const updatePatient = (id, payload) =>
  api.put(`/patients/${id}`, payload).then((r) => r.data.patient);

export const deletePatient = (id) => api.delete(`/patients/${id}`).then((r) => r.data);
