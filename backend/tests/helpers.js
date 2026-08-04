const BASE = process.env.TEST_API_URL || 'http://localhost:5000/api';

const PASSWORD = 'Password123!';

// The accounts the seed script creates.
const SEEDED = {
  clinician: 'dr.kuteishi@intellicare.ca',
  admin: 'admin@intellicare.ca',
  patient: 'elias.tobias@example.com',
  otherPatient: 'sam.smith@example.com',
};

const call = async (method, path, token, body) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let json = null;
  try {
    json = await response.json();
  } catch {
    // Some responses carry no body; the status is the result.
  }
  return { status: response.status, json };
};

const get = (path, token) => call('GET', path, token);
const post = (path, token, body) => call('POST', path, token, body);
const put = (path, token, body) => call('PUT', path, token, body);
const patch = (path, token, body) => call('PATCH', path, token, body);
const del = (path, token) => call('DELETE', path, token);

// Signs in and returns the token with the account behind it. A 429 here means
// the sign-in limiter is doing its job and the suite is being throttled, which
// is a setup problem rather than a failure, so it is called out as such.
const login = async (email, password = PASSWORD) => {
  const { status, json } = await post('/auth/login', null, { email, password });

  if (status === 429) {
    throw new Error(
      'Rate limited while signing in. Start the API with NODE_ENV=loadtest to run this suite.'
    );
  }
  if (status !== 200) {
    throw new Error(`Could not sign in as ${email} (HTTP ${status}). Has the database been seeded?`);
  }

  return { token: json.token, user: json.user };
};

// Fails early, and clearly, when the stack the suite talks to is not ready.
const requireRunningApi = async () => {
  let health;
  try {
    health = await get('/health');
  } catch {
    throw new Error(`No API at ${BASE}. Start it with: npm start --prefix backend`);
  }
  if (health.status !== 200) throw new Error(`API at ${BASE} answered ${health.status}, expected 200`);
};

// Every variable that would let the suite send a real message. Tests that drive
// the mail path in process switch them all off; naming them in one place means
// adding a third provider cannot quietly leave the tests posting to it.
const MAIL_SETTINGS = ['RESEND_API_KEY', 'BREVO_API_KEY', 'SMTP_HOST', 'SMTP_USER'];

// Silences outgoing mail and hands back the means to restore it, so a developer
// with working credentials does not have the suite write to seeded addresses.
const silenceMail = () => {
  const saved = {};
  for (const name of MAIL_SETTINGS) {
    saved[name] = process.env[name];
    delete process.env[name];
  }

  return () => {
    for (const [name, value] of Object.entries(saved)) {
      if (value !== undefined) process.env[name] = value;
    }
  };
};

// A unique string per run, so repeated runs never collide on unique columns.
const unique = (prefix) => `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}`;

// YYYY-MM-DD in local terms, which is what the appointment endpoints filter on.
const asDate = (date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');

const daysFromNow = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return asDate(date);
};

// Finds the patient profile id behind a seeded patient account, which is not the
// same number as their user id.
// Asks the directory for the patient by name rather than reading the first
// hundred and hoping. A database that has had patients added to it - by a bulk
// import, or by the suite itself - pushes the seeded ones off that first page,
// and every test in the file then fails on a missing fixture rather than on
// anything it was testing.
const patientIdFor = async (staffToken, name) => {
  const { json } = await get(
    `/patients?search=${encodeURIComponent(name)}&limit=100`,
    staffToken
  );

  const found = json.patients.find((patient) => patient.name === name);
  if (!found) throw new Error(`Seeded patient "${name}" not found. Has the database been seeded?`);
  return found.id;
};

module.exports = {
  BASE,
  PASSWORD,
  SEEDED,
  call,
  get,
  post,
  put,
  patch,
  del,
  login,
  requireRunningApi,
  silenceMail,
  unique,
  asDate,
  daysFromNow,
  patientIdFor,
};
