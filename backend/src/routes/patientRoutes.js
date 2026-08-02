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
  body('dateOfBirth').optional().isISO8601(),
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

module.exports = router;
