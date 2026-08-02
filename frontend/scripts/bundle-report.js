// What a browser downloads before it can show the first screen, and what it
// defers until somebody navigates.
//
// Total bundle size is the wrong number to optimise: a build can be enormous
// and still feel immediate if the part needed to paint is small. What matters
// is the initial payload - the entry chunk plus everything index.html tells the
// browser to fetch straight away - so that is what this measures.
//
//   npm run build && node scripts/bundle-report.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DIST = path.join(__dirname, '..', 'dist');
const ASSETS = path.join(DIST, 'assets');

if (!fs.existsSync(ASSETS)) {
  console.error('No dist/assets. Run `npm run build` first.');
  process.exit(1);
}

const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');

// Anything index.html names is fetched before the first paint, whether as the
// entry script or as a modulepreload.
const referenced = new Set(
  [...html.matchAll(/\/assets\/([^"']+\.(?:js|css))/g)].map((m) => m[1])
);

const sizeOf = (file) => {
  const bytes = fs.readFileSync(path.join(ASSETS, file));
  return { raw: bytes.length, gzip: zlib.gzipSync(bytes).length };
};

const files = fs.readdirSync(ASSETS).filter((f) => f.endsWith('.js') || f.endsWith('.css'));

const initial = [];
const deferred = [];

for (const file of files) {
  const entry = { file, ...sizeOf(file) };
  (referenced.has(file) ? initial : deferred).push(entry);
}

const total = (list, key) => list.reduce((sum, entry) => sum + entry[key], 0);
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

console.log('Loaded before the first screen can paint:\n');
for (const entry of initial.sort((a, b) => b.raw - a.raw)) {
  console.log(`  ${kb(entry.raw).padStart(9)}  ${kb(entry.gzip).padStart(9)} gzip   ${entry.file}`);
}
console.log(`  ${'-'.repeat(50)}`);
console.log(
  `  ${kb(total(initial, 'raw')).padStart(9)}  ${kb(total(initial, 'gzip')).padStart(9)} gzip   INITIAL`
);

console.log(`\nFetched on demand - ${deferred.length} route chunks:\n`);
console.log(
  `  ${kb(total(deferred, 'raw')).padStart(9)}  ${kb(total(deferred, 'gzip')).padStart(9)} gzip   ` +
  `across ${deferred.length} files`
);
console.log(
  `  largest: ${deferred.sort((a, b) => b.raw - a.raw).slice(0, 3).map((e) => e.file).join(', ')}`
);

const report = {
  takenAt: new Date().toISOString(),
  initial: {
    files: initial.length,
    raw: total(initial, 'raw'),
    gzip: total(initial, 'gzip'),
  },
  deferred: {
    files: deferred.length,
    raw: total(deferred, 'raw'),
    gzip: total(deferred, 'gzip'),
  },
};

const out = path.join(__dirname, '..', '..', 'backend', 'benchmarks', 'bundle.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(`\nwritten to backend/benchmarks/bundle.json`);
