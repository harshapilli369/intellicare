// Client-side validation, checked before anything is sent.
//
// This is a courtesy, not a control. Every rule here is enforced again on the
// server, which is where it actually matters - a browser is the attacker's
// machine and nothing it reports can be trusted. What this buys is the person
// filling in the form: telling them a field is empty should not cost a round
// trip, and it should not wait until they have pressed the button on a form
// they thought was finished.
//
// The rules deliberately mirror the server's, because two sets that disagree
// are worse than one: a form that accepts what the API rejects teaches people
// to distrust the form.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Matches the server's minimum. Kept as a constant so the message and the rule
// cannot drift apart.
export const MIN_PASSWORD_LENGTH = 8;

export const rules = {
  required: (label) => (value) =>
    String(value ?? '').trim() ? null : `${label} is required`,

  email: (value) =>
    !value || EMAIL.test(String(value).trim()) ? null : 'That does not look like an email address',

  password: (value) =>
    !value || String(value).length >= MIN_PASSWORD_LENGTH
      ? null
      : `Use at least ${MIN_PASSWORD_LENGTH} characters`,

  // A birth date in the future is a typo every time, and a date centuries back
  // is a slipped keystroke rather than a patient.
  pastDate: (value) => {
    if (!value) return null;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'That is not a date';
    if (date > new Date()) return 'That date is in the future';
    if (date < new Date('1900-01-01')) return 'Please check that date';
    return null;
  },

  maxLength: (limit, label) => (value) =>
    !value || String(value).length <= limit ? null : `${label} must be ${limit} characters or fewer`,

  range: (low, high, label) => (value) => {
    if (value === '' || value === null || value === undefined) return null;

    const number = Number(value);
    if (Number.isNaN(number)) return `${label} must be a number`;
    return number >= low && number <= high ? null : `${label} must be between ${low} and ${high}`;
  },

  // Whole numbers only, matching the server's `isInt`.
  //
  // Added because `range` alone was looser than the rule it was meant to
  // mirror: a severity of 7.5 passed here and was refused by the API, which is
  // the worst of both - the form promises something the server will not honour,
  // and the person filling it in is told "Invalid request" after the fact.
  wholeNumber: (label) => (value) => {
    if (value === '' || value === null || value === undefined) return null;

    const number = Number(value);
    if (Number.isNaN(number)) return `${label} must be a number`;
    return Number.isInteger(number) ? null : `${label} must be a whole number`;
  },

  matches: (other, message) => (value) => (value === other ? null : message),
};

// Runs a set of rules over a form and returns the problems by field.
//
// Fields with nothing wrong are absent rather than present-and-null, so the
// caller can ask `Object.keys(problems).length` without filtering.
export const validate = (values, schema) => {
  const problems = {};

  for (const [field, checks] of Object.entries(schema)) {
    for (const check of [checks].flat()) {
      const problem = check(values[field]);
      if (problem) {
        problems[field] = problem;
        // The first failure is the useful one; listing three complaints about
        // one field is noise.
        break;
      }
    }
  }

  return problems;
};
