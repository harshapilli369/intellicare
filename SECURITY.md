# Security

What is in place, what was scanned, what the scans found, and what was done
about each finding.

---

## Controls

**Authentication.** Passwords hashed with bcrypt. Sessions are JWTs, signed with
a secret the server refuses to start without — a missing or placeholder secret
would otherwise reject every token at request time and look like a login bug.

**Authorisation.** Role checks on every protected endpoint, and ownership checks
on top wherever a resource belongs to somebody. A patient asking for
`/patients/:id` gets their own record or a 403, never another patient's. Covered
by tests rather than asserted: every route is exercised for 401 and 403.

**Validation, both sides.** `express-validator` on every endpoint that takes
input, asserting type before value so a JSON body cannot smuggle an object where
a string belongs. The frontend validates too — required fields, lengths,
password confirmation, date bounds — but as a courtesy to the person typing, not
as a control. Anything the browser checks, the server checks again.

**Rate limiting.** Ten sign-in attempts per fifteen minutes, and a blanket limit
on the rest. Behind the platform's load balancer, `trust proxy` is set to one
hop so the limiter counts real callers rather than treating the whole clinic as
one — and only one hop, so a caller cannot set `X-Forwarded-For` and choose
their own bucket.

**Headers.** A content security policy denying every source (`default-src
'none'`, plus the three directives that do not fall back to it), HSTS, no
referrer, `nosniff`, a permissions policy switching off browser features this
application never uses, and `Cache-Control: no-store` so patient data is never
written to a shared workstation's disk.

**Secrets.** Environment variables only. `render.yaml` marks every secret
`sync: false` so nothing sensitive is in the repository.

---

## Scans

Three tools, on the principle that they find different things: one reads the
dependency tree, one reads the source, one attacks the running application.

| | Tool | Target | Result |
|---|---|---|---|
| SCA | `npm audit` | both dependency trees | 8 findings → **0 in the backend, 2 assessed** |
| SAST | Semgrep (`p/javascript`, `p/nodejs`, `p/security-audit`, `p/secrets`) | 113 source files, 336 rules | **1 finding → fixed** |
| DAST | OWASP ZAP baseline | the live deployment | 64 pass, 0 fail, **3 warnings → 2 fixed, 1 assessed** |

```bash
npm audit --prefix backend
semgrep --config=p/javascript --config=p/nodejs --config=p/security-audit \
        --config=p/secrets backend/src frontend/src
docker run --rm -v "$PWD/scans:/zap/wrk/:rw" -t ghcr.io/zaproxy/zaproxy:stable \
        zap-baseline.py -t https://intellicare.onrender.com -r zap-report.html
```

---

## What the SAST found, and why it mattered more than it looked

Semgrep raised one finding, `direct-response-write`, on the intake attachment
download — medium severity, and easy to wave away as a false positive because
the response is a file rather than a page. It was not a false positive, and the
real problem was worse than the rule described.

```js
res.setHeader('Content-Type', file.mimetype);
res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
res.send(file.data);
```

Both `file.mimetype` and `file.filename` come from whoever uploaded the file.
Neither was checked at upload — the multer configuration set size and count
limits but no type filter, and the frontend's `accept="image/*,.pdf"` only
steers the file picker. Anything could be posted.

That gave two ways in:

**Stored cross-site scripting.** Upload a file declaring `text/html`, and the
API serves it back with that type from its own origin. `Content-Disposition:
attachment` normally forces a download rather than a render — which brings us to
the second problem.

**Response header injection.** The filename is interpolated, unescaped, into a
quoted header field. A name containing a double quote ends the field early and
lets the rest be read as further parameters — turning `attachment` into
`inline`, and the download into a rendered page. A carriage return would end the
header entirely and begin forging new ones.

### Fixed in three places

1. **At upload**, a `fileFilter` accepts only images and PDFs. Nothing dangerous
   is stored in the first place.
2. **On the way out**, the stored type is checked against the same list rather
   than echoed. Rules change and records outlive them, so a file stored under an
   older rule is still served safely.
3. **The filename is stripped** of quotes, semicolons, path separators, control
   characters and anything outside printable ASCII, then bounded and never left
   empty. `X-Content-Type-Options: nosniff` stops a browser guessing a more
   dangerous type than the one declared.

Verified by test — the attack is attempted, not assumed:

```
PASS  an HTML file is refused at upload
PASS  a filename crafted to escape the header is refused with it
PASS  a photograph is accepted
PASS  the download is typed as it was stored
PASS    as an attachment, not a page
PASS    and the browser is told not to guess
```

---

## What the DAST found

64 checks passed against the live deployment with no failures. Three warnings.

**Permissions policy not set** — fixed. The header now switches off camera,
microphone, geolocation and the rest, none of which this application uses.

**Storable and cacheable content** — fixed, and it cost an optimisation. See
[PERFORMANCE.md](PERFORMANCE.md); the short version is that `no-cache` lets a
browser write patient charts to disk, a clinic workstation is shared, and
`no-store` is the right answer even though it gives up a revalidation saving.

**CSP: failure to define a directive with no fallback** — **assessed, no change
made.** The directives that do not inherit from `default-src` are `base-uri`,
`form-action` and `frame-ancestors`, and the policy sets all three explicitly
alongside `default-src 'none'`:

```
default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'
```

There is nothing further to tighten — the policy already denies everything. This
one is recorded as reviewed rather than silently suppressed, because "the
scanner said so" is not a reason to change a correct configuration, and neither
is it a reason to ignore one without saying why.

---

## What the dependency scan found

Eight advisories across both trees.

**Fixed:**

- **`nodemailer` 6.10 → 9.0.3** — eight advisories including SMTP command
  injection via unsanitised `envelope.size`, CRLF injection in transport names
  and `List-*` headers, and improper TLS certificate validation during OAuth2
  token fetch. On a production code path.
- **`uuid` 8.3.2 → 11.1.1**, via an `overrides` entry — a missing buffer bounds
  check. Pulled in transitively by `node-cron` and `sequelize`; overriding fixes
  all three findings without forcing a major upgrade on either parent.
- **`react-router-dom` 6.22 → 7.18.2** — open redirect leading to XSS. Cost
  about 35 KB of bundle, which is recorded in PERFORMANCE.md rather than hidden.
- **`vite` 5.1 → 7.x** — path traversal in optimised-deps `.map` handling, plus
  an `esbuild` advisory letting any site make requests to the dev server.

**Assessed, not fixed:**

- **`react-router` — RSC mode CSRF bypass.** The advisory applies to React
  Server Components. This is a Vite single-page application using declarative
  routing; there is no RSC, no server rendering, and no route actions. Not
  reachable in this configuration. There is also no fixed release: 7.18.2 is the
  latest, and npm's suggested "fix" of 7.11.0 is a downgrade.

**One npm suggestion was wrong and was not followed.** `npm audit` proposed
"upgrade to `sequelize@3.30.0`" — a downgrade from 6.37, across three major
versions, for an advisory that was only about a transitive `uuid`. Applying
audit fixes without reading them would have destroyed the data layer.

Backend: **0 vulnerabilities**. Frontend: 2, both the assessed React Router
finding above.

---

## Known gaps

- **The baseline ZAP scan is passive.** It crawls and inspects; it does not
  attempt injection or authentication attacks. A full active scan against an
  authenticated session would be the next step and has not been run.
- **No penetration testing** by a person.
- **The seeded accounts work on the public deployment.** `Password123!` signs
  anyone into a clinician account holding every patient record in the database.
  The data is invented; the exposure is real. This is a deliberate choice for
  assessment and should be reversed before the deployment outlives it.
- **Dependencies drift.** These scans are a point in time, not a subscription.
