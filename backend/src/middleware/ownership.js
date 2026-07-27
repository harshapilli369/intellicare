const { Patient } = require('../models/mysql');

// Restricts a patient to their own record while letting staff through.
//
// Clinicians and administrative assistants work across all patients, so they
// pass unconditionally. A patient may only act on the patient id that belongs
// to their own account; any other id is forbidden. Use on routes whose patient
// is identified by a route parameter (default `patientId`).
const requireOwnPatient =
  (param = 'patientId') =>
  async (req, res, next) => {
    try {
      if (req.user.role === 'clinician' || req.user.role === 'admin') return next();

      const profile = await Patient.findOne({ where: { userId: req.user.id } });
      if (!profile || String(profile.id) !== String(req.params[param])) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };

module.exports = { requireOwnPatient };
