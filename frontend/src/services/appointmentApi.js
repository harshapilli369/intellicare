import api from './api';

// Wrappers for the appointment endpoints. The backend scopes a patient to their
// own appointments, so the same calls serve every role.
export const listAppointments = (params = {}) =>
  api.get('/appointments', { params }).then((r) => r.data.appointments);

export const getAppointment = (id) =>
  api.get(`/appointments/${id}`).then((r) => r.data.appointment);

export const getAvailability = (clinicianId, date) =>
  api.get('/appointments/availability', { params: { clinicianId, date } }).then((r) => r.data.slots);

export const bookAppointment = (payload) =>
  api.post('/appointments', payload).then((r) => r.data.appointment);

export const rescheduleAppointment = (id, scheduledAt) =>
  api.patch(`/appointments/${id}/reschedule`, { scheduledAt }).then((r) => r.data.appointment);

export const cancelAppointment = (id) =>
  api.patch(`/appointments/${id}/cancel`).then((r) => r.data.appointment);

export const setAppointmentStatus = (id, status) =>
  api.patch(`/appointments/${id}/status`, { status }).then((r) => r.data.appointment);
