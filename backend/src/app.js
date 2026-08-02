require('dotenv').config();
const express = require('express');
const compression = require('compression');
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

// Compresses responses the client is willing to accept compressed. This API
// answers almost entirely in JSON, which is text with a great deal of
// repetition in it - the same field names on every row - so it compresses far
// better than most payloads: a patient chart goes from about 128KB to 8KB.
//
// Placed before the routes so everything they return passes through it, and
// before the body parsers so it is not doing work on requests.
//
// The threshold keeps small answers alone: below about a kilobyte, the headers
// and the CPU spent compressing cost more than the bytes saved.
app.use(
  compression({
    threshold: 1024,
    // A little more effort than the default 6. These payloads are generated
    // per request rather than served from a cache, but they are small enough
    // that the extra CPU is under a millisecond and the saving is real.
    level: 7,
  })
);

// Express already puts an ETag on every JSON response, which is what lets a
// client ask "has this changed?" and be told "no" in a few bytes instead of
// being sent the whole thing again. Without a Cache-Control directive, though,
// a browser is left to guess whether to bother asking, and generally does not.
//
// `no-cache` does not mean "do not cache" - it means "cache it, but check with
// me before using it". That is exactly right for clinical data: a stale chart
// must never be shown, and a revalidation that comes back 304 costs a couple
// of hundred bytes rather than the hundred kilobytes it replaces.
//
// `private` keeps it out of any shared cache in between, which patient data has
// no business sitting in.
app.use((req, res, next) => {
  if (req.method === 'GET') res.set('Cache-Control', 'private, no-cache');
  next();
});

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
