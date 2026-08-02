// Measures the API the way a browser experiences it: how long each call takes
// and how many bytes come back over the wire.
//
// The point is comparability. Run it, change something, run it again, and the
// two reports can be put side by side - which is what makes an optimisation a
// measurement rather than an opinion. Results are written as JSON so a later
// run can diff against an earlier one.
//
//   node scripts/benchmark.js baseline
//   node scripts/benchmark.js optimised
//   node scripts/benchmark.js compare baseline optimised
//
// The API must be running with NODE_ENV=loadtest, or the rate limiter will
// refuse the run long before it finishes.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BASE = process.env.TEST_API_URL || 'http://localhost:5000/api';
const RUNS = Number(process.env.BENCH_RUNS) || 30;
const RESULTS_DIR = path.join(__dirname, '..', 'benchmarks');

const signIn = async (email, password = 'Password123!') => {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error(`could not sign in as ${email} (HTTP ${r.status})`);
  return (await r.json()).token;
};

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

// Raw request, deliberately not `fetch`.
//
// `fetch` decompresses transparently and does not tell you it has, so the body
// it hands back is the decoded one while the header still says gzip - measuring
// it reports the uncompressed size and makes compression look like it did
// nothing. Counting bytes off the socket is the only way to know what actually
// crossed the wire, which is the number worth quoting.
const rawRequest = (url, headers) =>
  new Promise((resolve, reject) => {
    const target = new URL(url);
    const client = target.protocol === 'https:' ? require('https') : require('http');

    const request = client.request(
      target,
      { headers: { ...headers, 'Accept-Encoding': headers['Accept-Encoding'] || 'identity' } },
      (response) => {
        let bytes = 0;
        const chunks = [];

        response.on('data', (chunk) => {
          bytes += chunk.length;
          chunks.push(chunk);
        });
        response.on('end', () =>
          resolve({
            status: response.statusCode,
            headers: response.headers,
            bytesOverWire: bytes,
            body: Buffer.concat(chunks),
          })
        );
      }
    );

    request.on('error', reject);
    request.end();
  });

// One endpoint, many times. Reports the median rather than the mean: a single
// slow call - a cold connection, a garbage collection - drags a mean around and
// says nothing about what a user usually waits for.
const measure = async (label, path, token, { accept = 'identity' } = {}) => {
  const headers = { 'Accept-Encoding': accept };
  if (token) headers.Authorization = `Bearer ${token}`;

  const times = [];
  let bytesOverWire = 0;
  let bytesOfJson = 0;
  let encoding = 'none';
  let status = 0;

  // One unmeasured call first, so connection setup and any first-call work is
  // not counted as if it were the endpoint's cost.
  await rawRequest(`${BASE}${path}`, headers);

  for (let i = 0; i < RUNS; i += 1) {
    const started = process.hrtime.bigint();
    const response = await rawRequest(`${BASE}${path}`, headers);
    times.push(Number(process.hrtime.bigint() - started) / 1e6);

    status = response.status;
    bytesOverWire = response.bytesOverWire;
    encoding = response.headers['content-encoding'] || 'none';

    // What the payload would be uncompressed, so the saving can be stated.
    try {
      bytesOfJson =
        encoding === 'gzip'
          ? zlib.gunzipSync(response.body).length
          : encoding === 'br'
            ? zlib.brotliDecompressSync(response.body).length
            : encoding === 'deflate'
              ? zlib.inflateSync(response.body).length
              : response.body.length;
    } catch {
      bytesOfJson = response.body.length;
    }
  }

  const sorted = [...times].sort((a, b) => a - b);

  return {
    label,
    path,
    status,
    encoding,
    bytesOverWire,
    bytesOfJson,
    medianMs: Number(percentile(sorted, 0.5).toFixed(1)),
    p95Ms: Number(percentile(sorted, 0.95).toFixed(1)),
    minMs: Number(sorted[0].toFixed(1)),
  };
};

const run = async (name) => {
  console.log(`${BASE}  -  ${RUNS} runs per endpoint\n`);

  const clinician = await signIn('dr.kuteishi@intellicare.ca');
  const admin = await signIn('admin@intellicare.ca');
  const patient = await signIn('elias.tobias@example.com');

  const { patientId } = await fetch(`${BASE}/dashboard/patient`, {
    headers: { Authorization: `Bearer ${patient}` },
  }).then((r) => r.json());

  // Looked up rather than assumed to be 1. A hard-coded id that does not exist
  // measures a 33-byte "not found", which is not the endpoint's cost.
  const { clinicians } = await fetch(`${BASE}/users/clinicians`, {
    headers: { Authorization: `Bearer ${clinician}` },
  }).then((r) => r.json());
  const clinicianId = clinicians[0].id;

  // The calls that carry real payloads or do real work. A trivial endpoint
  // would only measure the round trip.
  const cases = [
    ['patient directory, one page', '/patients?limit=10', clinician],
    ['patient directory, full page', '/patients?limit=100', clinician],
    ['one patient chart', `/patients/${patientId}`, clinician],
    ['clinician dashboard', '/dashboard/clinician', clinician],
    ['admin dashboard', '/dashboard/admin', admin],
    ['appointment list', '/appointments', clinician],
    ['availability for a day', `/appointments/availability?clinicianId=${clinicianId}&date=2026-12-15`, clinician],
    ['clinical notes', `/notes/patient/${patientId}`, clinician],
    ['chart export (json)', `/patients/${patientId}/export?format=json`, clinician],
  ];

  const results = [];
  for (const [label, p, token] of cases) {
    // Asked for the way a browser asks, which is willing to accept compression.
    const result = await measure(label, p, token, { accept: 'gzip, deflate, br' });
    results.push(result);

    const saved = result.bytesOfJson > result.bytesOverWire
      ? `  (${Math.round((1 - result.bytesOverWire / result.bytesOfJson) * 100)}% smaller, ${result.encoding})`
      : '';
    console.log(
      `${String(result.medianMs).padStart(7)} ms  ` +
      `${String(result.bytesOverWire).padStart(7)} B  ${label}${saved}`
    );
  }

  const report = {
    name,
    takenAt: new Date().toISOString(),
    base: BASE,
    runs: RUNS,
    results,
  };

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const file = path.join(RESULTS_DIR, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(`\nwritten to benchmarks/${name}.json`);
};

const compare = (beforeName, afterName) => {
  const read = (n) => JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, `${n}.json`), 'utf8'));
  const before = read(beforeName);
  const after = read(afterName);

  const byPath = new Map(before.results.map((r) => [r.path, r]));

  console.log(`\n${beforeName} -> ${afterName}\n`);
  console.log('| Endpoint | Bytes before | Bytes after | Saved | ms before | ms after |');
  console.log('|---|---|---|---|---|---|');

  let bytesBefore = 0;
  let bytesAfter = 0;

  for (const now of after.results) {
    const then = byPath.get(now.path);
    if (!then) continue;

    bytesBefore += then.bytesOverWire;
    bytesAfter += now.bytesOverWire;

    const saved = Math.round((1 - now.bytesOverWire / then.bytesOverWire) * 100);
    console.log(
      `| ${now.label} | ${then.bytesOverWire.toLocaleString('en-US')} | ${now.bytesOverWire.toLocaleString('en-US')} ` +
      `| ${saved}% | ${then.medianMs} | ${now.medianMs} |`
    );
  }

  const overall = Math.round((1 - bytesAfter / bytesBefore) * 100);
  console.log(
    `| **Total** | **${bytesBefore.toLocaleString('en-US')}** | **${bytesAfter.toLocaleString('en-US')}** ` +
    `| **${overall}%** | | |`
  );
};

const [command, a, b] = process.argv.slice(2);

if (command === 'compare') {
  compare(a || 'baseline', b || 'optimised');
} else {
  run(command || 'baseline').catch((err) => {
    console.error(`\n${err.message}`);
    console.error('Is the API running with NODE_ENV=loadtest, and the database seeded?');
    process.exit(1);
  });
}
