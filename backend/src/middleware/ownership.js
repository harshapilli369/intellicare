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

      // Through the same helper as everywhere else, so an account missing its
      // profile is repaired here too rather than being refused by this one
      // route while the rest of the application has already healed it.
      const profile = await patientProfileFor(req.user);
      if (!profile || String(profile.id) !== String(req.params[param])) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };

// The Patient profile behind the signed-in user, or null when the user is
// staff. Lets a controller tell "acting on my own record" from "acting on
// someone's record" where the patient is not named in the route.
//
// A patient account with no profile is an inconsistent state rather than a
// meaningful one: public sign-up created the account row without the profile
// for a time, and those accounts could authenticate and then use nothing -
// every screen resolved through here and got nothing back.
//
// Sign-up now writes both rows together, but accounts created while it did not
// still exist and cannot repair themselves. So the profile is created on
// demand: the alternative is a person who signed up in good faith being told
// permanently that their dashboard cannot be found, and an administrator
// having to run a script for each of them.
//
// `findOrCreate` rather than a read followed by a write: two requests arriving
// together would otherwise both find nothing and both insert, and the unique
// index on userId would fail the second.
const patientProfileFor = async (user) => {
  if (user.role !== 'patient') return null;

  const [profile] = await Patient.findOrCreate({
    where: { userId: user.id },
    defaults: { userId: user.id },
  });

  return profile;
};

module.exports = { requireOwnPatient, patientProfileFor };
