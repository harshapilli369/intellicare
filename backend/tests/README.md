# End-to-end tests

229 tests across thirteen files. They exercise the running API over HTTP, across
all three roles. They are not unit tests: they need the server up, both
databases reachable, and the seed data in place.

That is the point. A test that mocks the database cannot catch a booking race, a
missing role check, or a query that only misbehaves once there are more than a
hundred rows — and all three of those have been caught here.

## Running them

**1. Seed the databases**

```bash
npm run seed --prefix backend
```

**2. Start the API with `NODE_ENV=loadtest`**

```bash
# bash
NODE_ENV=loadtest npm start --prefix backend

# PowerShell
$env:NODE_ENV='loadtest'; npm start --prefix backend
```

That environment does three things, each of them only appropriate for a test
run:

- lifts the sign-in limiter, which stops at ten attempts and would refuse the
  suite within seconds
- lifts the blanket API limiter, since the suite makes several hundred requests
- **stops the server sending real email**

The last one matters more than it looks. The invitation and reminder paths are
driven through the API, so silencing mail in the test process achieves nothing —
it is the *server* that would do the sending, to the seeded addresses, on
whatever credentials happen to be configured. That went unnoticed until a run
exhausted a real Gmail account's daily limit.

**3. Run the suite**

```bash
npm test --prefix backend
```

Point it elsewhere with `TEST_API_URL` if the API is not on
`http://localhost:5000/api`.

## What each file covers

| File | Covers |
|---|---|
| `auth.test.js` | Sign-in for all three roles, failures not revealing which accounts exist, public sign-up being unable to choose a role, staff creation being administrator-only |
| `patients.test.js` | Directory search, filter and pagination, the single record, ownership, administrative create / update / soft delete, and a patient correcting their own contact details without reaching anything clinical |
| `appointments.test.js` | Availability including impossible dates, booking with the concurrent-booking race, reschedule and cancel, the change window, status transitions |
| `notes.test.js` | The clinician-only gate, appointment and author links, chronological history, the edit window, one clinician being unable to revise another's note |
| `prescriptions.test.js` | The formulary check, the medication list, and what reaches a later AI brief |
| `intake.test.js` | Submission with attachments, ownership, what reaches the clinical context, and the clinic requesting a form |
| `invitations.test.js` | Import issuing an invitation rather than a password, redemption, single use, reissue, and import updating patients it already knows |
| `reminders.test.js` | The horizon scan, idempotent dispatch, and per-patient schedules and channels |
| `notifications.test.js` | Ownership, unread counts, marking read, and that the detail is carried and not just the heading |
| `dashboard.test.js` | Each role's dashboard against the underlying data it claims to summarise |
| `screens.test.js` | The exact calls each screen makes, asserting the fields it renders are present |
| `email.test.js` | Which transport a message takes, and that a refusal is reported rather than thrown |
| `security.test.js` | Rate limiting, security headers, and that nothing carrying patient data is reachable without a token |

## Conventions

- **Make what you create unique per run** (`unique()` in `helpers.js`) and clean
  it up, or the database grows until something else breaks. It has: enough
  imported patients pushed the seeded ones off the first page of the directory
  and every test in `appointments.test.js` failed on a missing fixture.
- **Look fixtures up by name, not by position.** `patientIdFor()` searches
  rather than reading the first hundred rows, for the reason above.
- **Do not assert on totals that other files can move.** Test files run in
  parallel against one database, so "the directory had one fewer row afterwards"
  is not reliable. Ask about the record you are actually testing.
- **Read related values together** with `Promise.all` when comparing two
  endpoints, so a concurrent change cannot land between them.
- **Appointment tests pick a random day a month or more ahead**, to stay outside
  the change window and to keep repeated runs from competing for slots.
- **Do not assert the exact wording of a message that depends on the
  environment.** One reminder test pinned the reason mail was skipped, which
  differs depending on whether `NODE_ENV=loadtest` — so the suite passed or
  failed according to how it was invoked.
- **Write the test from the requirement, not the implementation.** The suite
  once asserted that a patient was refused the clinician picker, which was the
  bug: it passed while the booking screen was unusable. A test that agrees with
  the code proves nothing.
