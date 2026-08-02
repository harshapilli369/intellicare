import api from './api';

// The clinicians a visit can be booked with. Open to anyone who books - staff
// booking on a patient's behalf, and a patient booking their own - and returns
// names, not accounts.
export const listClinicians = () => api.get('/users/clinicians').then((r) => r.data.clinicians);
