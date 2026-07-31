# End-to-end tests

These exercise the running API over HTTP, across all three roles. They are not
unit tests: they need the server up, both databases reachable, and the seed data
in place.

## Running them

Three terminals' worth of setup, then one command.

**1. Seed the databases**

```bash
npm run seed --prefix backend
```

**2. Start the API with the rate limits lifted**

The suite makes several hundred requests and signs in far more than ten times,
so the sign-in limiter and the blanket API limiter will throttle it on a normal
start. `NODE_ENV=loadtest` lifts both, and is never used in a deployment.

```bash
# bash
NODE_ENV=loadtest npm start --prefix backend

# PowerShell
$env:NODE_ENV='loadtest'; npm start --prefix backend
```

**3. Run the suite**

```bash
npm test --prefix backend
```

Point it somewhere else with `TEST_API_URL` if the API is not on
`http://localhost:5000/api`.

## What each file covers

| File | Covers |
|------|--------|
| `auth.test.js` | Sign-in for all three roles, that failures do not reveal which accounts exist, that public sign-up cannot choose a role, and that staff accounts are administrator-only |
| `patients.test.js` | The directory's search, filter and pagination, the single record, ownership, and the administrative create / update / soft delete |
| `appointments.test.js` | Availability, booking including the concurrent-booking race, reschedule and cancel, the change window, and status transitions |
| `notes.test.js` | The clinician-only gate, the appointment and author links, chronological history, the edit window, and one clinician being unable to revise another's note |
| `screens.test.js` | The exact calls each screen makes, asserting the fields it renders are present |

## Notes on writing more

- Tests share the seeded database and run against a live server, so anything
  they create should be unique per run (`unique()` in `helpers.js`) and cleaned
  up afterwards where it would otherwise accumulate.
- Appointment tests pick a random day a month or more ahead, both to stay
  outside the change window and to keep repeated runs from competing for slots.
- Assert relative counts (before and after) rather than absolute ones; the seed
  is a starting point, not a fixed fixture.
