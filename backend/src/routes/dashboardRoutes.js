const router = require('express').Router();
const { query } = require('express-validator');

const dashboardController = require('../controllers/dashboardController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');

router.use(authenticate);

// Scoped to the signed-in clinician; there is no id to pass, so one clinician
// cannot ask for another's day.
router.get(
  '/clinician',
  authorize('clinician'),
  query('month')
    .optional()
    .matches(/^\d{4}-\d{2}$/)
    .withMessage('month must look like YYYY-MM'),
  validate,
  dashboardController.clinicianDashboard
);

module.exports = router;
