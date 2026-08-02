const router = require('express').Router();
const { body, param, query } = require('express-validator');

const appointmentController = require('../controllers/appointmentController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');

router.use(authenticate);

const STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'];
const appointmentId = param('id').isInt({ min: 1 }).toInt();

// Without this, a date is only checked for its shape, so "2026-09-31" passes
// and `new Date` quietly rolls it back to the 30th - the caller is answered
// about a day it did not ask about, and books into it none the wiser. Strict
// mode counts the days in the month and refuses the ones that do not exist.
const REAL_CALENDAR_DATE = { strict: true };

// Everyone signed in can read appointments; the controller narrows a patient to
// their own, which is what keeps one visit visible to its patient, its
// clinician and an admin alike.
router.get(
  '/',
  [
    query('clinicianId').optional().isInt({ min: 1 }).toInt(),
    query('patientId').optional().isInt({ min: 1 }).toInt(),
    query('status').optional().isIn(STATUSES),
    query('from').optional().isISO8601(REAL_CALENDAR_DATE),
    query('to').optional().isISO8601(REAL_CALENDAR_DATE),
  ],
  validate,
  appointmentController.list
);

router.get(
  '/availability',
  [query('clinicianId').isInt({ min: 1 }).toInt(), query('date').isISO8601(REAL_CALENDAR_DATE)],
  validate,
  appointmentController.availability
);

// Declared after /availability so that path is not swallowed by :id.
router.get('/:id', appointmentId, validate, appointmentController.getById);

// Patients book for themselves, admins book on their behalf, and a clinician
// can put a visit in their own book.
router.post(
  '/',
  [
    body('clinicianId').isInt({ min: 1 }).toInt(),
    body('scheduledAt').isISO8601(REAL_CALENDAR_DATE),
    body('patientId').optional().isInt({ min: 1 }).toInt(),
    body('reason').optional().isString().trim().isLength({ max: 500 }),
  ],
  validate,
  appointmentController.book
);

router.patch(
  '/:id/reschedule',
  [appointmentId, body('scheduledAt').isISO8601()],
  validate,
  appointmentController.reschedule
);

router.patch('/:id/cancel', appointmentId, validate, appointmentController.cancel);

// Recording how a visit turned out is the clinic's own record, so it stays with
// staff and accepts only the outcomes a past appointment can have.
router.patch(
  '/:id/status',
  authorize('clinician', 'admin'),
  [appointmentId, body('status').isIn(['scheduled', 'completed', 'no_show'])],
  validate,
  appointmentController.setStatus
);

module.exports = router;
