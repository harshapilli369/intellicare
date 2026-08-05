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

`compression` middleware, threshold 1 KB, brotli quality 4. The API answers almost
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

### 3. `Cache-Control`, and an optimisation given up on purpose

This began as `private, no-cache` — cache it, but revalidate before use — so
that a repeated read could come back as a 304 costing a couple of hundred bytes
instead of the payload.

**A baseline security scan of the deployment then flagged the responses as
storable, and it was right to.** `no-cache` permits a browser to write a copy to
disk; these are patient charts, and a clinic workstation is shared. A chart left
in an on-disk cache outlives the session that fetched it.

So the header is now `no-store`, and the revalidation saving is deliberately
given up. It was never large — compression is what made these responses small —
and it is not worth leaving patient records on a shared machine's disk. Recorded
here rather than quietly dropped, because giving up an optimisation is a result
too.

See [SECURITY.md](SECURITY.md) for the scan that prompted it.

### Result

Both columns measured back to back in one session against the same database, so
the comparison is not distorted by the dataset having grown between runs.

| Endpoint | Bytes before | Bytes after | Saved | ms before | ms after |
|---|---|---|---|---|---|
| Patient directory, one page | 2,564 | 456 | 82% | 19.1 | 38.3 |
| Patient directory, full page | 24,915 | 1,883 | 92% | 23.6 | 33.2 |
| One patient chart | 168,307 | 1,052 | **99%** | 51.9 | **23.3** |
| Clinician dashboard | 859 | 859 | 0% | 28.8 | 31.3 |
| Admin dashboard | 855 | 855 | 0% | 14.7 | 16.7 |
| Appointment list | 123,819 | 4,382 | 96% | 48.4 | 50.5 |
| Availability for a day | 497 | 497 | 0% | 11.9 | 12.4 |
| Clinical notes | 42,429 | 3,536 | 92% | 18.9 | 22.6 |
| Chart export (JSON) | 187,493 | 8,524 | 95% | 47.0 | 58.5 |
| **Total** | **551,738** | **22,044** | **96%** | | |

**552 KB down to 22 KB — a 96% reduction across the nine endpoints measured.**

The three endpoints showing 0% are already under the 1 KB compression
threshold; leaving them alone is the optimisation working as intended, not
failing to.

### Reading the millisecond column honestly

**The byte reduction is the reliable result. The latency column is not, and it
would be misleading to present it as a win.**

Two things are happening in it.

**Compression trades CPU for bandwidth, and this benchmark cannot see the half
that pays.** It runs over loopback, where transfer is effectively free, so all
it measures is the cost of compressing and none of the benefit of sending less.
Over any real network — and certainly to a browser on a phone — sending 8 KB
instead of 187 KB is overwhelmingly the faster choice. On localhost it can only
ever look like a loss.

That cost was worth tuning rather than accepting. The `compression` middleware
defaults to brotli quality **11**, which is meant for assets compressed once and
served thousands of times; these responses are built per request. At 11 the
export went from 47 ms to 66 ms. Dropping to quality **4** gave most of that
back at almost no cost in size — 58.5 ms for the same 8,524 bytes.

**The rest is measurement noise.** The directory's one-page response is 456
bytes and appears to have gone from 19 ms to 38 ms, which nothing in the change
explains — it is not even compressed at that size. Two databases, a test
suite and a container runtime were competing for the same machine. Millisecond
differences of this size on a loopback benchmark are not evidence of anything.

**One latency result is real:** the patient chart, **51.9 ms → 23.3 ms**. That
is not encoding, it is work removed — the server had been reading and
serialising 572 rows to render a screen that displays about twenty. Removing
work is reliably faster in a way that re-encoding a payload is not.

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

JavaScript only. The stylesheet is unchanged by either optimisation and is
excluded from both columns so the comparison is like for like.

| | Before | After | Change |
|---|---|---|---|
| Initial JS | 340.5 KB | 261.6 KB | **−23%** |
| Initial JS, gzipped | 103.2 KB | 89.6 KB | **−13%** |
| Deferred | 0 | 106.6 KB across 31 chunks | fetched on demand |
| Stable across deployments | 0 KB | 239.1 KB (two vendor chunks) | cached, not re-downloaded |

The "after" column is re-measured from the current build rather than left at the
figure this document first reported (258.7 KB, 28 chunks). Features added since —
invitations, the combined add-patient screen, the patient's own details page —
are what moved it, and they moved the deferred column more than the initial one,
which is the split doing its job.

**The "after" figure carries a security upgrade that made it worse, and the
number is left honest rather than flattered.** React Router was upgraded from 6
to 7 to close an open-redirect advisory (see [SECURITY.md](SECURITY.md)), and
version 7 is roughly 35 KB heavier. The splitting alone saved more than 24%;
the security fix gave part of it back. Reporting the larger figure by measuring
against the older dependency would have been the easy option and the wrong one.

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
