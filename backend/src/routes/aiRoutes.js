const router = require('express').Router();
const { body, param } = require('express-validator');

const aiController = require('../controllers/aiController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { requireOwnPatient } = require('../middleware/ownership');

router.use(authenticate);

const appointmentId = param('appointmentId').isInt({ min: 1 }).toInt();
const patientId = param('patientId').isInt({ min: 1 }).toInt();

router.post(
  '/pre-appointment/:appointmentId',
  authorize('clinician'),
  appointmentId,
  validate,
  aiController.generatePreSummary
);

// The notes may be sent with the request or read from what is already recorded
// against the visit, so they are optional here but bounded when present.
router.post(
  '/post-appointment/:appointmentId',
  authorize('clinician'),
  [appointmentId, body('clinicianNotes').optional().isString().isLength({ max: 20000 })],
  validate,
  aiController.generatePostSummary
);

router.get(
  '/summary/:appointmentId',
  authorize('clinician'),
  appointmentId,
  validate,
  aiController.getSummaryByAppointment
);

// Only the two pieces of text may be revised on the way to release; the service
// ignores anything else, and these rules stop the rest arriving at all.
router.patch(
  '/summary/:appointmentId/finalize',
  authorize('clinician'),
  [
    appointmentId,
    body('clinicianSummary').optional().isString().isLength({ max: 20000 }),
    body('patientSummary').optional().isString().isLength({ max: 20000 }),
  ],
  validate,
  aiController.finalizeSummary
);

router.get(
  '/patient/:patientId/summaries',
  authorize('clinician', 'patient'),
  patientId,
  validate,
  requireOwnPatient('patientId'),
  aiController.getPatientSummaries
);

module.exports = router;
