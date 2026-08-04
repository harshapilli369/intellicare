const router = require('express').Router();
const { body, param } = require('express-validator');

const prescriptionController = require('../controllers/prescriptionController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { requireOwnPatient } = require('../middleware/ownership');

router.use(authenticate);

// Declared before /patient/:patientId so the word is not read as a patient id.
router.get(
  '/formulary',
  authorize('clinician', 'admin'),
  prescriptionController.formulary
);

// Prescribing is the clinician's alone; the issuing clinician is taken from the
// token rather than the body.
router.post(
  '/',
  authorize('clinician'),
  [
    body('patientId').isInt({ min: 1 }).toInt(),
    body('appointmentId').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
    body('medication').isString().bail().trim().notEmpty(),
    body('dosage').optional().isString().trim().isLength({ max: 120 }),
    body('frequency').optional().isString().trim().isLength({ max: 120 }),
    body('route').optional().isString().trim().isLength({ max: 60 }),
    body('duration').optional().isString().trim().isLength({ max: 60 }),
  ],
  validate,
  prescriptionController.create
);

// Staff read any patient's list; a patient reads their own, which is what the
// ownership check enforces once the role check has let them through.
router.get(
  '/patient/:patientId',
  authorize('clinician', 'admin', 'patient'),
  param('patientId').isInt({ min: 1 }).toInt(),
  validate,
  requireOwnPatient('patientId'),
  prescriptionController.listForPatient
);

// Last, so neither "formulary" nor "patient" is read as an id.
router.get(
  '/:id',
  authorize('clinician', 'admin', 'patient'),
  param('id').isInt({ min: 1 }).toInt(),
  validate,
  prescriptionController.getById
);

module.exports = router;
