const router = require('express').Router();
const { body, param, query } = require('express-validator');

const patientController = require('../controllers/patientController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { requireOwnPatient } = require('../middleware/ownership');

router.use(authenticate);

// Shared by create and update. Every field is optional here; create adds its
// own rules for the ones it additionally requires.
const demographics = [
  body('phone').optional().isString().trim(),
  body('dateOfBirth').optional().isISO8601(),
  body('sex').optional().isIn(['Male', 'Female', 'Other']),
  body('address').optional().isString().trim(),
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

module.exports = router;
