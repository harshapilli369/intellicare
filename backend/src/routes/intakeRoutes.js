const router = require('express').Router();
const multer = require('multer');
const { body, param } = require('express-validator');

const intakeController = require('../controllers/intakeController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');

// Held in memory and written into the submission document rather than to disk.
// Capped tightly: these are photographs and lab reports a patient took on a
// phone, not archives.
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 4;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES },
});

router.use(authenticate);

const appointmentId = param('appointmentId').isInt({ min: 1 }).toInt();

// Only a patient fills one in, and the controller checks the visit is theirs.
router.post(
  '/:appointmentId',
  authorize('patient'),
  upload.array('attachments', MAX_FILES),
  [
    appointmentId,
    body('mainComplaint').isString().bail().trim().isLength({ min: 1, max: 2000 }),
    body('durationDays').optional({ checkFalsy: true }).isInt({ min: 0, max: 3650 }),
    body('severity').optional({ checkFalsy: true }).isInt({ min: 1, max: 10 }),
    body('medicationsTaken').optional().isString().trim().isLength({ max: 2000 }),
    body('additionalNotes').optional().isString().trim().isLength({ max: 4000 }),
  ],
  validate,
  intakeController.submit
);

// The clinic asking for a form. Staff only - a patient does not request one of
// themselves, they simply fill it in.
router.post(
  '/:appointmentId/request',
  authorize('clinician', 'admin'),
  [appointmentId, body('message').optional().isString().trim().isLength({ max: 500 })],
  validate,
  intakeController.request
);

// What the signed-in patient still has to fill in. Scoped to them from the
// token, so there is no id to get wrong or to tamper with.
router.get('/outstanding', authorize('patient'), intakeController.outstandingForMe);

// Staff read it before the visit; the patient can see what they submitted.
router.get(
  '/appointment/:appointmentId',
  authorize('clinician', 'admin', 'patient'),
  appointmentId,
  validate,
  intakeController.getForAppointment
);

router.get(
  '/appointment/:appointmentId/attachment/:index',
  authorize('clinician', 'admin', 'patient'),
  [appointmentId, param('index').isInt({ min: 0, max: MAX_FILES - 1 }).toInt()],
  validate,
  intakeController.downloadAttachment
);

// multer rejects an oversized or over-numerous upload by throwing, which would
// otherwise surface as a generic server error rather than telling the patient
// what was wrong with their file.
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Each file must be 5MB or smaller'
        : err.code === 'LIMIT_FILE_COUNT'
          ? `You can attach up to ${MAX_FILES} files`
          : 'That upload could not be accepted';
    return res.status(400).json({ message });
  }
  return next(err);
});

module.exports = router;
