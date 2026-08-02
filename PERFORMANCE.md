# Performance optimisation

Five optimisations — three server-side, two client-side — each measured before
and after with the same harness, on the same machine, against the same seeded
database.

Everything below is reproducible:

```bash
# Server: 30 runs per endpoint, bytes counted off the socket
node scripts/benchmark.js baseline        # before your change
node scripts/benchmark.js optimised       # after it
node scripts/benchmark.js compare baseline optimised

# Client
npm run build && node scripts/bundle-report.js
```

Raw results are committed in [backend/benchmarks/](backend/benchmarks/).

---

## How it was measured

**Median, not mean.** One slow call — a cold connection, a garbage collection —
drags a mean around and says nothing about what a user usually waits for. Each
endpoint is called 30 times after one unmeasured warm-up, and the middle value
is reported.

**Bytes counted off the socket, not from the response object.** This one nearly
went wrong. Node's `fetch` decompresses transparently and does not say it has:
the body it returns is decoded while the header still reads `br`. Measuring that
reports the *uncompressed* size and makes compression look like it did nothing.
The harness therefore uses a raw `http.request` and counts the chunks as they
arrive, which is the only number that reflects what crossed the wire.

**The baseline was re-measured with the final harness**, not carried over from
an earlier run, so both sides of every comparison were produced the same way.

---

## Server-side

### 1. Response compression

`compression` middleware, threshold 1 KB, level 7. The API answers almost
entirely in JSON — text with the same field names repeated on every row — which
compresses far better than most payloads. Small answers are left alone, because
below about a kilobyte the headers and the CPU cost more than the bytes saved.

### 2. Bounded history on the patient chart

`GET /patients/:id` returned **every** appointment and prescription a patient
had ever accumulated. On a well-used record that was 361 appointments and 211
prescriptions — 128 KB of JSON to render a screen that shows a dozen lines — and
it grew without limit for the life of the record.

The chart now carries the 25 most recent of each, with the full counts alongside
so the screen can say how much more there is rather than implying it has shown
everything. The two reads also run concurrently rather than one after the other.
The complete history is still available: the export returns all of it, and the
appointment list takes filters.

### 3. `Cache-Control` so revalidation actually happens

Express already puts an ETag on every JSON response, but without a
`Cache-Control` directive a browser is left to guess whether to revalidate, and
generally refetches instead.

`private, no-cache` does not mean "do not cache" — it means "cache it, but check
with me before using it". That is exactly right for clinical data: a stale chart
must never be shown, while a revalidation that comes back `304` costs a couple
of hundred bytes instead of the payload it replaces. `private` also keeps
patient data out of any shared cache in between.

### Result

| Endpoint | Bytes before | Bytes after | Saved | ms before | ms after |
|---|---|---|---|---|---|
| Patient directory, one page | 2,598 | 457 | 82% | 8.2 | 8.0 |
| Patient directory, full page | 24,525 | 2,014 | 92% | 14.7 | 11.1 |
| One patient chart | 128,030 | 1,026 | **99%** | 17.0 | **7.7** |
| Clinician dashboard | 859 | 859 | 0% | 12.4 | 10.1 |
| Admin dashboard | 855 | 855 | 0% | 6.3 | 5.3 |
| Appointment list | 92,903 | 3,495 | 96% | 20.2 | 15.7 |
| Availability for a day | 497 | 497 | 0% | 5.2 | 4.9 |
| Clinical notes | 35,051 | 2,961 | 92% | 9.5 | 7.9 |
| Chart export (JSON) | 146,098 | 7,020 | 95% | 19.2 | 17.7 |
| **Total** | **431,416** | **19,184** | **96%** | | |

**431 KB down to 19 KB — a 96% reduction across the nine endpoints measured.**

The three endpoints showing 0% are the ones already under the 1 KB compression
threshold; leaving them uncompressed is the optimisation working as intended,
not failing to.

The patient chart is worth calling out separately: **128 KB → 1 KB, and 17 ms →
7.7 ms**. Compression accounts for the bytes, but the latency came from the
bounded reads — the server had been serialising 572 rows to render a screen that
displays about twenty.

---

## Client-side

### 4. Route-based code splitting

Every screen was in one 340 KB bundle. A patient signing in downloaded the bulk
import screen, the prescription pad and the AI summary editor — screens they are
not permitted to open — before their own dashboard could paint.

Each route behind a sign-in is now a `React.lazy` import, so a browser fetches a
screen when somebody navigates to it and never requests the other two roles'
screens at all. The pre-sign-in screens stay in the first bundle deliberately:
making a visitor wait on a second request to be shown a login form would be
slower, not faster.

### 5. Vendor chunk separation

React, the router, Axios and the toast library are split into their own chunks.
Bundled with application code, every deployment invalidates the browser's copy
of React too and a returning user re-downloads all of it. Split apart, the
vendor chunk keeps its filename across deployments and stays cached.

### Result

JavaScript only. The 41 KB stylesheet is unchanged by either optimisation and
is excluded from both columns so the comparison is like for like.

| | Before | After | Change |
|---|---|---|---|
| Initial JS | 340.5 KB | 241.7 KB | **−29%** |
| Initial JS, gzipped | 103.2 KB | 82.6 KB | **−20%** |
| Deferred | 0 | 100.0 KB across 28 chunks | fetched on demand |
| Stable across deployments | 0 KB | 221.2 KB (two vendor chunks) | cached, not re-downloaded |

The application's own entry chunk is now **20.5 KB** — the rest of the initial
payload is framework code that a returning visitor already has.

---

## What was considered and rejected

**Adding database indexes.** The obvious next move, and it turned out the
appointments table already carried composite indexes on `(clinicianId,
scheduledAt)` and `(patientId, scheduledAt)`, which are the two access patterns
that matter. Claiming credit for indexes that already existed would have been
dishonest, and adding redundant ones would have cost write performance for
nothing. The measurements above show query time was not the bottleneck —
payload size was.

**Caching AI summaries.** Already done, before this exercise: a generated
summary is stored against a hash of the inputs that produced it, so an unchanged
context is served without calling the model, and a changed one regenerates
rather than serving something stale.

**Debouncing the patient search.** Also already present, at 300 ms.

---

## Honest limitations

- Measured against a **local** stack. Network latency to the deployed instance
  dominates these numbers in production — which makes the byte reductions more
  valuable there, not less, since bytes are what a slow connection charges for.
- The `Cache-Control` benefit is not in the table above. The harness measures
  fresh requests; the 304 path needs a client holding a previous ETag, which is
  a browser behaviour rather than something this harness reproduces.
- The bundle numbers are build output, not a field measurement. No real-user
  monitoring is in place.
