import api from './api';

// The form a patient fills in before a visit. Sent as multipart because it may
// carry photographs or lab reports alongside the written answers.
export const submitIntake = (appointmentId, answers, files = []) => {
  const form = new FormData();
  Object.entries(answers).forEach(([field, value]) => {
    if (value !== undefined && value !== null && value !== '') form.append(field, value);
  });
  files.forEach((file) => form.append('attachments', file));

  return api
    .post(`/intake/${appointmentId}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data.intake);
};

export const getIntake = (appointmentId) =>
  api.get(`/intake/appointment/${appointmentId}`).then((r) => r.data.intake);

// Attachments are fetched through the same authenticated client as everything
// else, then handed to the browser as a download.
export const downloadAttachment = (appointmentId, index, filename) =>
  api
    .get(`/intake/appointment/${appointmentId}/attachment/${index}`, { responseType: 'blob' })
    .then((response) => {
      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    });
