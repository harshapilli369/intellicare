// What may be uploaded, and how what was uploaded is safely handed back.
//
// A file a patient sends is attacker-controlled in three ways at once: its
// bytes, its declared type, and its name. Each needs its own answer, and the
// third is the one most often missed.

// Photographs from a phone and reports from another clinic. Anything the
// browser might execute or render as a document is refused, because a file
// served back from the API's own origin is same-origin content.
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'application/pdf',
]);

// Refuses at the point of upload, so nothing dangerous is ever stored.
//
// The frontend's `accept` attribute is a convenience for the file picker, not
// a control: it is a hint to the dialog and anything can be posted regardless.
const fileFilter = (req, file, callback) => {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) return callback(null, true);

  const error = new Error('Only images and PDFs can be attached');
  error.code = 'LIMIT_UNEXPECTED_FILE_TYPE';
  return callback(error, false);
};

// The type a stored file is served back as.
//
// Never the type it claimed on the way in, even though that was checked when it
// was stored: rules change, records outlive the rules they were written under,
// and a stored `text/html` served from this origin is a scripting
// vulnerability against every user who opens it. Anything unrecognised is sent
// as an opaque download instead.
const safeContentType = (mimetype) =>
  ALLOWED_MIME_TYPES.has(mimetype) ? mimetype : 'application/octet-stream';

// A filename that cannot escape the header it is written into.
//
// `Content-Disposition: attachment; filename="<name>"` puts an attacker's
// string inside a quoted field. A quote ends the field early and lets the rest
// be read as further parameters - `inline` instead of `attachment`, say, which
// turns a download into a page render. A carriage return ends the header
// altogether and begins forging new ones.
//
// So: strip anything that is not plainly part of a name, keep it short, and
// never let it be empty.
const safeFilename = (filename) => {
  const cleaned = String(filename || '')
    // Path separators, quotes, control characters, and the semicolons that
    // separate header parameters.
    .replace(/[\\/"';\r\n\t]/g, '_')
    // Anything outside printable ASCII: a filename is not the place to carry it,
    // and the header is a byte string.
    .replace(/[^\x20-\x7E]/g, '_')
    .trim()
    .slice(0, 100);

  return cleaned || 'attachment';
};

module.exports = { ALLOWED_MIME_TYPES, fileFilter, safeContentType, safeFilename };
