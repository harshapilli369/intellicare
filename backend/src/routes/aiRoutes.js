const router = require('express').Router();
const aiController = require('../controllers/aiController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { requireOwnPatient } = require('../middleware/ownership');

router.use(authenticate);

router.post('/pre-appointment/:appointmentId', authorize('clinician'), aiController.generatePreSummary);
router.post('/post-appointment/:appointmentId', authorize('clinician'), aiController.generatePostSummary);
router.get('/summary/:appointmentId', authorize('clinician'), aiController.getSummaryByAppointment);
router.patch('/summary/:appointmentId/finalize', authorize('clinician'), aiController.finalizeSummary);
router.get(
  '/patient/:patientId/summaries',
  authorize('clinician', 'patient'),
  requireOwnPatient('patientId'),
  aiController.getPatientSummaries
);

module.exports = router;
