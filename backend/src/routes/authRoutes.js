const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');

const authController = require('../controllers/authController');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');

// Sign-in is the one unauthenticated endpoint that checks a secret, so it is
// where an attacker guesses passwords. The global limit is far too generous to
// stop that. Lifted only under the loadtest environment, never in a deployment.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'loadtest' ? 100000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many sign-in attempts, please try again later' },
});

// Both fields are asserted to be strings before they reach the controller, so a
// JSON body cannot smuggle an object where a string is expected.
const credentials = [
  body('email').isString().bail().trim().isEmail().normalizeEmail(),
  body('password').isString().bail().isLength({ min: 1, max: 200 }),
];

router.post(
  '/register',
  [
    ...credentials,
    body('name').isString().trim().notEmpty(),
    body('phone').optional().isString(),
    body('role').optional().isIn(['clinician', 'admin', 'patient']),
  ],
  validate,
  authController.register
);

router.post('/login', loginLimiter, credentials, validate, authController.login);
router.get('/me', authenticate, authController.me);

module.exports = router;
