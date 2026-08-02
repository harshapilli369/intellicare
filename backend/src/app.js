require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { connectMySQL } = require('./config/mysql');
const { syncModels } = require('./models/mysql');
const { connectMongoDB } = require('./config/mongodb');
const authRoutes = require('./routes/authRoutes');
const patientRoutes = require('./routes/patientRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const noteRoutes = require('./routes/noteRoutes');
const intakeRoutes = require('./routes/intakeRoutes');
const prescriptionRoutes = require('./routes/prescriptionRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const userRoutes = require('./routes/userRoutes');
const aiRoutes = require('./routes/aiRoutes');
const errorHandler = require('./middleware/errorHandler');
const reminderJob = require('./jobs/reminderJob');

const app = express();

// Deployed behind a host's load balancer, so the socket's address is the
// proxy's and every caller looks like the same one. Without this the rate
// limiters key everything on that single address: one person fumbling their
// password ten times would lock out the whole clinic, and a real attacker
// would be indistinguishable from everybody else.
//
// One hop - the platform's own proxy. Trusting the whole chain would let a
// caller set X-Forwarded-For themselves and pick their own rate limit bucket.
app.set('trust proxy', 1);

// This process serves JSON and file downloads, never a page. Nothing it returns
// should ever be allowed to load a script, a stylesheet or a frame, so the
// policy denies every source outright rather than relying on the defaults being
// tight enough. `frame-ancestors 'none'` also keeps a response from being
// framed by another site.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'base-uri': ["'none'"],
        'form-action': ["'none'"],
      },
    },
    // Downloads are served to the browser that asked for them; this keeps a
    // cross-origin page from reading one it did not request.
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
  })
);

app.use(morgan('dev'));

// Only the configured frontend may call the API with credentials. An absent
// CLIENT_URL would otherwise make `cors` reflect whatever origin asked, which
// in a deployment means any site can call this on a signed-in user's behalf.
app.use(
  cors({
    origin: process.env.CLIENT_URL || false,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Blanket limit on the API. Lifted under the loadtest environment, matching the
// sign-in limiter, so a benchmark or an end-to-end run is not throttled by it.
// Never lifted in a deployment.
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'loadtest' ? 1000000 : 200,
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/intake', intakeRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', userRoutes);
app.use('/api/ai', aiRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Refuses to start rather than running with a setting that only fails later, or
// silently weakens something. A missing signing secret would reject every token
// at request time and look like a login bug; a default one would let anybody
// mint a token for any role.
const checkConfiguration = () => {
  const problems = [];

  if (!process.env.JWT_SECRET) {
    problems.push('JWT_SECRET is not set');
  } else if (process.env.JWT_SECRET.length < 32) {
    problems.push('JWT_SECRET is shorter than 32 characters');
  } else if (/^(your_|changeme|secret|test)/i.test(process.env.JWT_SECRET)) {
    problems.push('JWT_SECRET still looks like the example value');
  }

  if (process.env.NODE_ENV === 'production' && !process.env.CLIENT_URL) {
    problems.push('CLIENT_URL is not set, so no browser origin is allowed to call the API');
  }

  // Not fatal - it is a legitimate way to run the test suite - but it must never
  // pass unremarked, since it turns the rate limiting off.
  if (process.env.NODE_ENV === 'loadtest') {
    console.warn('Running with rate limiting disabled (NODE_ENV=loadtest). Not for deployment.');
  }

  if (problems.length > 0) {
    console.error('Refusing to start:');
    problems.forEach((problem) => console.error(`  - ${problem}`));
    process.exit(1);
  }
};

async function start() {
  checkConfiguration();

  try {
    await connectMySQL();
    await syncModels();
    await connectMongoDB();
  } catch (err) {
    console.error(`Database connection failed: ${err.message}`);
    process.exit(1);
  }
  // Started after the databases are up, since the first scan reads both.
  reminderJob.start();

  app.listen(PORT, () => console.log(`IntelliCare API running on port ${PORT}`));
}

start();
