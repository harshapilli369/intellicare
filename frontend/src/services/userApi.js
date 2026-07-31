import api from './api';

// The clinicians a visit can be booked with. Staff only; returns names, not
// accounts.
export const listClinicians = () => api.get('/users/clinicians').then((r) => r.data.clinicians);
