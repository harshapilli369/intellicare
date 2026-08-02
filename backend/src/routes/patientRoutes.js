const router = require('express').Router();
const multer = require('multer');
const { body, param, query } = require('express-validator');

const patientController = require('../controllers/patientController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { requireOwnPatient } = require('../middleware/ownership');

// Import files are small (a batch of patient rows) and read once into memory
// to be parsed; nothing about them is ever written to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.use(authenticate);

// Shared by create and update. Every field is optional here; create adds its
// own rules for the ones it additionally requires.
const demographics = [
  body('phone').optional().isString().trim(),
  // Strict, so a birthday that never happened - the 31st of a thirty-day month,
  // the 29th of a February with 28 - is refused rather than silently kept as the
  // day before it.
  body('dateOfBirth').optional().isISO8601({ strict: true }),
  body('sex').optional().isIn(['Male', 'Female', 'Other']),
  body('address').optional().isString().trim(),
  body('healthCardNumber').optional().isString().trim().isLength({ max: 40 }),
  body('medicalHistory').optional().isArray(),
  body('allergies').optional().isArray(),
];

const patientId = param('id').isInt({ min: 1 }).toInt();

// The directory is staff-only: a patient has no reason to enumerate the others.
router.get(
  '/',
  authorize('clinician', 'admin'),
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().isString().trim(),
    query('sex').optional().isIn(['Male', 'Female', 'Other']),
  ],
  validate,
  patientController.list
);

// Staff read any profile; a patient reads only their own, which is what the
// ownership check enforces after the role check has let them this far.
router.get(
  '/:id',
  authorize('clinician', 'admin', 'patient'),
  patientId,
  validate,
  requireOwnPatient('id'),
  patientController.getById
);

// Onboarding, editing, and removal are the administrative assistant's job.
router.post(
  '/',
  authorize('admin'),
  [
    body('email').isString().bail().trim().isEmail().normalizeEmail(),
    body('password').isString().bail().isLength({ min: 8, max: 200 }),
    body('name').isString().bail().trim().notEmpty(),
    ...demographics,
  ],
  validate,
  patientController.create
);

router.put(
  '/:id',
  authorize('admin'),
  [patientId, body('name').optional().isString().trim().notEmpty(), ...demographics],
  validate,
  patientController.update
);

// When and how a patient wants to be reminded about their visits. Declared
// before `/:id` so "me" is never read as an id, and scoped from the token so
// there is no id to tamper with.
router.get(
  '/me/reminder-preferences',
  authorize('patient'),
  patientController.getReminderPreferences
);

router.put(
  '/me/reminder-preferences',
  authorize('patient'),
  [
    // An empty list is meaningful - it is a patient asking not to be reminded -
    // so it is accepted, while a missing list is not.
    body('offsetsHours').isArray({ max: 6 }),
    body('offsetsHours.*').isInt({ min: 1, max: 336 }).toInt(),
    body('email').optional().isBoolean().toBoolean(),
    body('inApp').optional().isBoolean().toBoolean(),
  ],
  validate,
  patientController.setReminderPreferences
);

// How the clinic reaches a patient, corrected by the patient themselves. A
// separate route from the one above on purpose: that one accepts clinical and
// identifying fields and is an administrator's, this one accepts two contact
// fields and nothing else. Keeping them apart means a patient cannot reach the
// wider handler at all, rather than reaching it and being filtered.
router.put(
  '/:id/contact-details',
  authorize('patient'),
  [
    patientId,
    body('phone').optional({ nullable: true }).isString().trim().isLength({ max: 40 }),
    body('address').optional({ nullable: true }).isString().trim().isLength({ max: 255 }),
  ],
  validate,
  requireOwnPatient('id'),
  patientController.updateOwnDetails
);

router.delete('/:id', authorize('admin'), patientId, validate, patientController.remove);

// A patient's own chart, or (staff) any patient's — the ownership check draws
// that line the same way the profile read above does. Format is checked in
// the controller so an unsupported value gets a message naming the ones that
// work, rather than express-validator's generic field-rejection response.
router.get(
  '/:id/export',
  authorize('clinician', 'admin', 'patient'),
  patientId,
  query('format').optional().isIn(['csv', 'json', 'pdf']),
  validate,
  requireOwnPatient('id'),
  patientController.exportChart
);

// Bulk onboarding from a file is the same administrative privilege as
// onboarding one patient by hand.
router.post(
  '/import',
  authorize('admin'),
  upload.single('file'),
  patientController.importPatients
);

// Issues a fresh invitation for a patient who has not set a password yet, or
// whose link has expired or gone astray. This is what makes an import report
// something nobody has to copy down: the link can always be had again.
router.post(
  '/:id/invitation',
  authorize('admin'),
  patientId,
  validate,
  patientController.invitePatient
);

module.exports = router;
