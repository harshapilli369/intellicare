const router = require('express').Router();
const { param, query } = require('express-validator');

const notificationController = require('../controllers/notificationController');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');

router.use(authenticate);

// No role check: every signed-in account has its own notifications, and the
// controller only ever reads the one behind the token.
router.get(
  '/',
  query('unread').optional().isIn(['true', 'false']),
  validate,
  notificationController.list
);

router.patch('/read-all', notificationController.markAllRead);

// Checked for shape so a malformed id cannot reach the driver and come back as
// a server error.
router.patch(
  '/:id/read',
  param('id').isMongoId(),
  validate,
  notificationController.markRead
);

module.exports = router;
