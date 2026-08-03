const { validationResult } = require('express-validator');

// Field names as they appear in a request body, written the way a person would
// say them. Without this the response names `mainComplaint` and `durationDays`,
// which are the shape of the code rather than anything on the screen.
const READABLE = {
  mainComplaint: 'what is troubling you',
  durationDays: 'how long it has been going on',
  severity: 'how bad it is',
  medicationsTaken: 'what you have taken for it',
  additionalNotes: 'anything else',
  scheduledAt: 'the appointment time',
  clinicianId: 'the clinician',
  patientId: 'the patient',
  dateOfBirth: 'the date of birth',
  healthCardNumber: 'the health card number',
  offsetsHours: 'the reminder times',
  password: 'the password',
  email: 'the email address',
  name: 'the name',
  phone: 'the phone number',
  reason: 'the reason for the visit',
  medication: 'the medication',
  dosage: 'the dosage',
};

const readable = (field) => READABLE[field] || field;

// Stops a request whose body failed validation before it reaches a controller.
//
// The response names the offending fields but never the values, so it cannot be
// used to probe for what exists. What it does now say is *which* fields, in
// words: "Invalid request" on its own leaves somebody staring at a form with
// eight inputs and no idea which one it means, which is how a validation
// message ends up worse than no message at all.
module.exports = (req, res, next) => {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const fields = [...new Set(result.array().map((error) => error.path))];
  const named = fields.map(readable);

  const list =
    named.length === 1
      ? named[0]
      : `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`;

  return res.status(400).json({
    message: `Please check ${list}.`,
    // The raw field names as well, so a form can mark the right inputs.
    fields,
  });
};
