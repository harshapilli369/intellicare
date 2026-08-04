# IntelliCare

An AI-assisted clinical workflow platform for primary care. Clinicians spend
less time reconstructing a patient's history before a visit and less time
writing it up afterwards; patients get a plain-language account of what
happened and can manage their own appointments.

**Live:**

| Tier | Host | URL |
|---|---|---|
| Frontend | Vercel | https://intellicare-harsha-pilli-s-projects.vercel.app |
| Backend | Render | https://intellicare.onrender.com |
| MySQL | Railway | private |
| MongoDB | Atlas | private |

The free Render instance sleeps when idle, so the first request after a quiet
period takes up to a minute. Everything after that is normal speed.

---

## Contents

- [Tech stack](#tech-stack)
- [What it does](#what-it-does)
- [Running it locally](#running-it-locally)
- [Seed data and accounts](#seed-data-and-accounts)
- [Tests](#tests)
- [Deployment](#deployment)
- [Known limitations](#known-limitations)
- [Architecture notes](#architecture-notes)
- [API reference](#api-reference)

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, React Router, Axios, Context API |
| Backend | Node.js 20, Express |
| Relational database | MySQL via Sequelize — users, patients, appointments, prescriptions, invitations |
| Document database | MongoDB via Mongoose — notes, AI summaries, notifications, intake, audit log |
| AI | Google Gemini (`gemini-3.1-flash-lite`) |
| Auth | JWT, bcrypt |
| Email | Brevo HTTP API, with SMTP as a local fallback |
| Tests | `node:test` (built in), 229 end-to-end tests |

The two databases are deliberate rather than incidental. Appointments and
prescriptions need referential integrity and transactional booking, so they are
relational. Clinical notes and AI summaries vary in shape and length and are
read whole, so they are documents.

---

## What it does

### Roles

| Role | Can |
|---|---|
| **Clinician** | Read any patient's chart, write and revise notes, prescribe, request intake forms, generate and release AI summaries |
| **Admin** | Onboard patients singly or in bulk, book on a patient's behalf, record attendance, export charts, invite patients to set a password |
| **Patient** | Book, reschedule and cancel their own visits, submit intake forms, read released summaries, correct their contact details, choose their reminder schedule, export their own record |

Every protected endpoint checks the role, and ownership on top of it where the
resource belongs to somebody — a patient reading `/patients/:id` gets their own
record or a 403, never someone else's.

### Features

**Authentication and access control.** Passwords hashed with bcrypt, sessions as
JWTs. Public sign-up always creates a patient; staff accounts are created by an
existing administrator through a separate endpoint.

**Patient management.** A searchable, filterable directory, and a full chart:
demographics, medical history, allergies, current medications, past visits, and
links through to the notes and summaries for each.

**Appointment booking.** Initiated by a patient or by an administrator on their
behalf. Availability comes from the clinic's working hours and the clinician's
existing diary, and a slot is only confirmed if it is still free at the moment of
submission — [the booking race is tested](backend/tests/appointments.test.js),
not assumed.

**Clinical notes.** Written against a visit, revisable by their author within a
configurable window, read-only after it, and shown newest first.

**Prescriptions.** Validated against a reference formulary, joined to the
patient's medication list, fed into later AI briefs, and printable on a sheet
with no navigation on it.

**AI summaries.** A pre-appointment brief for the clinician, and after the visit
both a clinical summary and a plain-language one for the patient. Nothing
reaches the patient until a clinician has reviewed and released it.

**Patient self-service.** A patient can correct how the clinic reaches them,
choose when and how they are reminded, submit intake forms with photographs or
reports attached, and export their own record.

**Import and export.** CSV or JSON in, adding new patients or updating existing
ones, with per-row errors naming the field and the reason. Charts out as CSV,
JSON, or PDF. Every export and import is written to an audit log.

**Invitations.** An imported patient is never given a password somebody else
chose. They receive a single-use, expiring link and set their own; an
administrator can issue a fresh one at any time.

**Reminders and notifications.** In-app for everyone, email where configured,
on a schedule each patient can set for themselves.

---

## Running it locally

### Prerequisites

- Node.js 20+
- MySQL (or Docker, see below)
- MongoDB (local or an Atlas cluster)
- A Google Gemini API key — free tier is enough

### Install

```bash
npm run install:all
```

### Configure

```bash
cp backend/.env.example backend/.env
```

Then fill it in. The comments in that file explain each setting; the ones you
cannot skip are `JWT_SECRET`, the MySQL settings, `MONGODB_URI`, and
`GEMINI_API_KEY`. The server refuses to start on a missing, short, or
placeholder `JWT_SECRET` rather than failing every sign-in later and looking
like a bug.

### A MySQL, if you have not got one

```bash
docker compose -f backend/docker-compose.dev.yml up -d
```

It reads the values already in your `.env`, so both sides stay in step. It
publishes on **3307** rather than 3306, because a locally installed MySQL
usually holds 3306 and binding a taken port makes the container fail to start.

### Run

```bash
npm run dev                      # both, together
npm run dev --prefix frontend    # React on http://localhost:3000
npm run dev --prefix backend     # Express on http://localhost:5000
```

The Vite dev server proxies `/api` to the backend, so no CORS configuration is
needed locally.

---

## Seed data and accounts

```bash
npm run seed --prefix backend
```

Populates both databases with staff, patients, appointments, prescriptions,
notes and a summary. Safe to re-run — it clears what is there first.

Every seeded account uses the password `Password123!`:

| Role | Email |
|---|---|
| Clinician | `dr.kuteishi@intellicare.ca` |
| Admin | `admin@intellicare.ca` |
| Patient | `elias.tobias@example.com`, and five other `<name>@example.com` |

> **These credentials work on the deployed site.** That is intentional for
> assessment and demonstration, and it means anyone who finds the URL can sign
> in as a clinician and read every patient record in it. The data is invented,
> but the exposure is real. Before this is shown anywhere it should not be,
> change the seeded passwords or take the deployment down.

---

## Tests

229 end-to-end tests across thirteen files, run against a live server rather
than mocks: they make real HTTP requests, through real middleware, to real
databases.

```bash
# 1. Seed
npm run seed --prefix backend

# 2. Start the API with the rate limits lifted
$env:NODE_ENV='loadtest'; npm start --prefix backend    # PowerShell
NODE_ENV=loadtest npm start --prefix backend            # bash

# 3. Run them
npm test --prefix backend
```

`NODE_ENV=loadtest` does three things, all of them only appropriate for a test
run: it lifts the sign-in and API rate limits, which the suite would otherwise
trip within seconds; and it stops the server sending real email, which it would
otherwise do to the seeded addresses on whatever credentials are configured.

Point the suite elsewhere with `TEST_API_URL`.

See [backend/tests/README.md](backend/tests/README.md) for what each file
covers and the conventions to follow when adding more.

---

## Deployment

Four independently deployed tiers, which is the separation the project set out
to demonstrate. Each can be redeployed without touching the others.

### Two remotes, and why

| Remote | Where | Role |
|---|---|---|
| `origin` | `git.cs.dal.ca/hpilli/intellicare` | The project repository. Branches, issues, merge requests. |
| `deploy` | `github.com/harshapilli369/intellicare` | A mirror. Render and Vercel build from it. |

Dal's GitLab is not reachable from Render or Vercel, so a GitHub mirror stands
in as the build source. It holds exactly one branch, `main`, which is a copy of
GitLab's `develop`:

```bash
git push deploy develop:main     # note: no -u, or develop's upstream moves
```

Branches and merge requests live on GitLab only. GitHub is a deployment target,
not somewhere work happens.

### Backend — Render

`render.yaml` defines the service. Every secret is `sync: false`, so Render
prompts for it rather than reading it from the repository. Set at minimum:
`JWT_SECRET`, `CLIENT_URL`, `MYSQL_URL`, `MONGODB_URI`, `GEMINI_API_KEY`.

Paste Railway's connection URL whole into `MYSQL_URL` rather than retyping the
five separate variables — one string is far harder to get wrong, and a mistyped
password surfaces as "access denied" rather than as a typo.

`CLIENT_URL` must be the exact frontend origin, scheme included. It is the only
origin allowed to call the API, and it is also the base of the invitation links
emailed to patients.

### Frontend — Vercel

Root directory `frontend`. `VITE_API_URL` must be set at build time — it is
compiled into the bundle, so changing it needs a rebuild, not a restart.
`vercel.json` adds the rewrite that makes deep links resolve to the app instead
of a 404.

### Databases

MySQL on Railway, MongoDB on Atlas, both independent of the application tier.
Make sure the Mongo URI names a database (`.../intellicare?...`) — without one,
everything quietly lands in a database called `test`.

Tables and collections are created on first start. There are no migrations to
run.

---

## Known limitations

Recorded here rather than discovered during a demonstration.

**Email does not send from the deployment.** Render's free instances
[block outbound SMTP](https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports)
on ports 25, 465 and 587 as policy, and block it by swallowing the connection
rather than refusing it — so a send hangs and then reports `Connection timeout`
however correct the credentials are. The same Gmail App Password delivers in
under three seconds from a developer machine.

The mail service therefore chooses its transport from configuration: an HTTPS
provider when one is configured (`RESEND_API_KEY` or `BREVO_API_KEY`), SMTP when
neither is, and a reported skip when nothing is.

**To switch delivery on quickly** — for a demonstration, say — create a
[Resend](https://resend.com) account, and set `RESEND_API_KEY` along with
`MAIL_FROM=onboarding@resend.dev`. That sends immediately with no domain to
verify. The limitation is that it will only deliver to the address the account
was registered with, so it demonstrates the feature honestly but does not serve
a real clinic; Brevo, which verifies one sender and then delivers to anybody, is
the answer for that.

With nothing configured:

- an invitation is created and the link is shown to the administrator to pass
  on, rather than being emailed to the patient
- appointment reminders raise the in-app notification but not the email

Setting `BREVO_API_KEY` and `MAIL_FROM` on Render switches both on with no code
change, as would a paid instance with the SMTP variables restored.

**No security scan has been run against the deployment.** Issue #29 named one in
its acceptance criteria. The application-level controls it would look for are in
place and tested — rate limiting, security headers, a content security policy,
role and ownership checks on every endpoint — but no scanner has been pointed at
the running site.

**The frontend has no automated tests.** The 229 tests cover the API
comprehensively. React components are verified by building and by hand.

**Reminders only fire while the service is awake.** The scan is a cron job
inside the API process, and the free instance sleeps when idle.

---

## Architecture notes

### AI

The browser never talks to Gemini. Every request goes:

```
Frontend → Backend → Gemini → Backend → Frontend
```

The API key stays on the server, prompts are composed server-side from the
patient's own record, and no caller can send arbitrary text to the model.

A generated summary is cached against a hash of the inputs that produced it, so
asking again for an unchanged context costs nothing — and a changed context
(new intake, a new prescription) produces a fresh summary rather than serving a
stale one. A finalized summary is exempt: once a clinician has approved and
released it, it is not silently rewritten underneath them.

AI-generated text is labelled wherever it appears, and a clinician reviews and
may edit both summaries before the patient-facing one is released.

### Booking concurrency

Two people asking for the same slot at the same moment must not both get it. The
booking transaction takes an exclusive lock on the clinician's own row, so
everything writing into one diary happens in turn.

The obvious alternative — a `SELECT ... FOR UPDATE` on the appointments table —
does not work here. A search matching no rows takes a gap lock rather than a row
lock, several transactions can hold the same gap at once, and each then needs an
insert-intention lock that conflicts with the others; they deadlock or sit until
the lock wait times out. The reasoning is written out in
[schedule.js](backend/src/services/schedule.js), and the behaviour is asserted
by a concurrent-booking test.

### Trusting the proxy

`app.set('trust proxy', 1)` — deployed behind a load balancer, every request
arrives from the same address, so without it the rate limiters count the whole
clinic as one caller and ten failed sign-ins would lock everybody out. One hop
only: trusting the whole chain would let a caller set `X-Forwarded-For` and
choose their own bucket.

---

## API reference

All routes are under `/api`. Everything except sign-in, sign-up, and the
invitation endpoints requires a bearer token.

### Auth

| Method | Endpoint | Who |
|---|---|---|
| `POST` | `/auth/register` | public — always creates a patient |
| `POST` | `/auth/login` | public |
| `GET` | `/auth/me` | any signed-in user |
| `POST` | `/auth/staff` | admin — creates a clinician or admin |
| `GET` | `/auth/invite/:token` | public — is this invitation still good |
| `POST` | `/auth/invite/:token` | public — set a first password |

### Patients

| Method | Endpoint | Who |
|---|---|---|
| `GET` | `/patients` | staff — search, filter, paginate |
| `GET` | `/patients/:id` | staff, or the patient themselves |
| `POST` | `/patients` | admin |
| `PUT` | `/patients/:id` | admin |
| `PUT` | `/patients/:id/contact-details` | the patient themselves |
| `DELETE` | `/patients/:id` | admin — soft delete |
| `GET` | `/patients/:id/export` | staff, or the patient — `?format=csv\|json\|pdf` |
| `POST` | `/patients/import` | admin — adds and updates |
| `POST` | `/patients/:id/invitation` | admin |
| `GET`/`PUT` | `/patients/me/reminder-preferences` | the patient themselves |

### Appointments

| Method | Endpoint | Who |
|---|---|---|
| `GET` | `/appointments` | any — scoped to the caller |
| `GET` | `/appointments/availability` | any |
| `GET` | `/appointments/:id` | any with access to it |
| `POST` | `/appointments` | patient for themselves, staff for anyone |
| `PATCH` | `/appointments/:id/reschedule` | patient or staff |
| `PATCH` | `/appointments/:id/cancel` | patient or staff |
| `PATCH` | `/appointments/:id/status` | staff |

### Clinical

| Method | Endpoint | Who |
|---|---|---|
| `POST` `PATCH` | `/notes`, `/notes/:id` | clinician |
| `GET` | `/notes/patient/:id`, `/notes/appointment/:id` | staff |
| `GET` | `/prescriptions/formulary` | clinician |
| `POST` | `/prescriptions` | clinician |
| `GET` | `/prescriptions/patient/:id`, `/prescriptions/:id` | staff, or the patient |

### Intake

| Method | Endpoint | Who |
|---|---|---|
| `POST` | `/intake/:appointmentId` | the patient — multipart, up to 4 files |
| `POST` | `/intake/:appointmentId/request` | staff — ask for a form |
| `GET` | `/intake/outstanding` | the patient |
| `GET` | `/intake/appointment/:id` | staff, or the patient |
| `GET` | `/intake/appointment/:id/attachment/:index` | staff, or the patient |

### AI, dashboards, notifications

| Method | Endpoint | Who |
|---|---|---|
| `POST` | `/ai/pre-appointment/:id`, `/ai/post-appointment/:id` | clinician |
| `GET` | `/ai/summary/:id` | clinician |
| `PATCH` | `/ai/summary/:id/finalize` | clinician — releases to the patient |
| `GET` | `/ai/patient/:id/summaries` | the patient — released only |
| `GET` | `/dashboard/clinician`, `/dashboard/admin`, `/dashboard/patient` | the matching role |
| `GET` | `/notifications` | any |
| `PATCH` | `/notifications/:id/read`, `/notifications/read-all` | any |
| `GET` | `/users/clinicians` | any — id and name, for booking |
