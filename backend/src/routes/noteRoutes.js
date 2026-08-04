const router = require('express').Router();
const { body, param } = require('express-validator');

const noteController = require('../controllers/noteController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');

router.use(authenticate);

// Clinical notes are the treating clinician's own record of an encounter.
// Patients are given the plain-language summary instead, and the administrative
// role has no clinical reason to read them, so the whole router is clinician
// only rather than guarding each route separately.
router.use(authorize('clinician'));

const noteBody = body('body').isString().bail().trim().isLength({ min: 1, max: 20000 });

router.post(
  '/',
  [body('appointmentId').isInt({ min: 1 }).toInt(), noteBody],
  validate,
  noteController.create
);

// The id is a Mongo document id; checking its shape keeps a malformed value
// from reaching the driver and surfacing as a server error.
router.patch('/:id', [param('id').isMongoId(), noteBody], validate, noteController.update);

router.get(
  '/patient/:patientId',
  param('patientId').isInt({ min: 1 }).toInt(),
  validate,
  noteController.listForPatient
);

router.get(
  '/appointment/:appointmentId',
  param('appointmentId').isInt({ min: 1 }).toInt(),
  validate,
  noteController.listForAppointment
);

module.exports = router;
