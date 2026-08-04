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

// A patient correcting how the clinic reaches them. A different endpoint from
// `updatePatient`, which is an administrator's and accepts clinical fields.
export const updateOwnContactDetails = (id, { phone, address }) =>
  api.put(`/patients/${id}/contact-details`, { phone, address }).then((r) => r.data.patient);

const FILENAME_RE = /filename="?([^"]+)"?/;

// Downloads a patient's chart in the given format and saves it through the
// browser, the same way a link to a static file would. The request goes
// through the shared `api` instance so the auth token is attached like any
// other call; only the response type differs, since this one is a file.
export const exportPatient = (id, format) =>
  api
    .get(`/patients/${id}/export`, { params: { format }, responseType: 'blob' })
    .then((response) => {
      const disposition = response.headers['content-disposition'] || '';
      const filename = FILENAME_RE.exec(disposition)?.[1] || `patient-${id}-chart.${format}`;

      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    });

// Issues the patient a fresh invitation to set their password and emails it,
// retiring any earlier one. Returns the link too, so it can be passed on by
// hand where mail is not configured.
export const invitePatient = (id) =>
  api.post(`/patients/${id}/invitation`).then((r) => r.data.invitation);

// When and how the signed-in patient wants to be reminded. Scoped by the token,
// so there is no id to pass. Reading it back when nothing has been set returns
// the clinic's own schedule, flagged as such.
export const getReminderPreferences = () =>
  api.get('/patients/me/reminder-preferences').then((r) => r.data.preferences);

export const setReminderPreferences = (preferences) =>
  api.put('/patients/me/reminder-preferences', preferences).then((r) => r.data.preferences);

// Bulk import from a CSV or JSON file. Returns the per-row report so the
// caller can show what was inserted and what was rejected, and why.
export const importPatients = (file) => {
  const form = new FormData();
  form.append('file', file);
  return api
    .post('/patients/import', form, { headers: { 'Content-Type': 'multipart/form-data' } })
    .then((r) => r.data);
};
