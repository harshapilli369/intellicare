const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { body, param } = require('express-validator');

const authController = require('../controllers/authController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
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

// Public sign-up. `role` is deliberately absent: this route is unauthenticated,
// so accepting one would let any caller register themselves as staff. Anything
// sent under that name is ignored and the account is created as a patient.
router.post(
  '/register',
  [
    ...credentials,
    body('name').isString().trim().notEmpty(),
    body('phone').optional().isString(),
  ],
  validate,
  authController.register
);

// Staff accounts. Creating a clinician or an administrator is an
// administrator's decision, so the role is only honoured behind that check.
router.post(
  '/staff',
  authenticate,
  authorize('admin'),
  [
    ...credentials,
    body('name').isString().trim().notEmpty(),
    body('phone').optional().isString(),
    body('role').isIn(['clinician', 'admin']),
  ],
  validate,
  authController.createStaff
);

router.post('/login', loginLimiter, credentials, validate, authController.login);
router.get('/me', authenticate, authController.me);

// An invitation token is a credential - holding one sets an account's password
// - so these are limited like sign-in rather than left on the general allowance.
// A token is 64 hex characters, so this is not a limit anyone reaches honestly.
const inviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'loadtest' ? 100000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts, please try again later' },
});

const inviteToken = param('token').isString().bail().isLength({ min: 64, max: 64 }).isHexadecimal();

router.get(
  '/invite/:token',
  inviteLimiter,
  inviteToken,
  validate,
  authController.checkInvitation
);

router.post(
  '/invite/:token',
  inviteLimiter,
  [inviteToken, body('password').isString().bail().isLength({ min: 8, max: 200 })],
  validate,
  authController.acceptInvitation
);

module.exports = router;
