const router = require('express').Router();

const { User } = require('../models/mysql');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

router.use(authenticate);

// Who can be booked with. Staff only, and only the name needed to choose one:
// this is a picker, not a directory of accounts.
router.get('/clinicians', authorize('clinician', 'admin'), async (req, res, next) => {
  try {
    const clinicians = await User.findAll({
      where: { role: 'clinician' },
      attributes: ['id', 'name'],
      order: [['name', 'ASC']],
    });
    res.json({ success: true, clinicians });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
