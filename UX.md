# UX design

The principles this interface was built against, where each one is visible, and
why the debatable decisions were made the way they were.

---

## Approach

Design came before code. The screens were drawn in Figma first — launch, sign
in, three role dashboards, patient record, appointment views, notes,
prescription, onboarding — and the implementation follows those frames rather
than inventing its own layout. Where the built screens depart from the drawings,
it is recorded below with the reason.

The evaluation instrument for testing the prototype with users is in
[the last section](#prototype-evaluation), along with where the results go.

---

## Principles applied

Assessed against **Nielsen's ten usability heuristics**, because they are the
standard vocabulary for this and because they are specific enough to argue
with. Each is named, then shown.

### 1. Visibility of system status

The interface never leaves somebody guessing whether it heard them.

- Every action that takes time says so in the control that triggered it, in the
  present tense: *Booking…*, *Generating…*, *Exporting…*, *Sending…*,
  *Finalizing…*. The button is disabled while it runs, so the same action cannot
  be fired twice.
- Loading a screen says what is loading — *Loading your appointments…* rather
  than a bare spinner.
- The notification bell carries an unread count and polls, so something raised
  by a background job appears without a reload.
- A patient's dashboard leads with what the clinic is waiting on, above anything
  they might merely like to read.

### 2. Match between the system and the real world

The wording is the clinic's, not the database's.

- **Appointment ids are never shown.** An early build displayed them on the
  patient dashboard; they are an implementation detail nobody in a clinic
  quotes. Visits are identified by who, what and when.
- `no_show` is stored as an enum and displayed as *Missed* to a patient and *No
  show* to staff — the same fact, in each reader's language.
- Times read as *Thursday, August 6 at 9:00 a.m.*, not `2026-08-06T09:00:00Z`.
- Empty states describe the situation rather than the query: *You have no
  upcoming appointments*, not *0 results*.

### 3. User control and freedom

Every destructive or committing action has a way back.

- Booking, rescheduling and cancelling are all reversible within the clinic's
  change window, and the window is explained when it stops something.
- Every dialog closes on **Escape**, on a backdrop click, and on an explicit
  *Cancel*.
- The reschedule panel offers *Never mind*.
- A generated AI summary is editable, and stays private to the clinician, until
  they choose to release it.
- Error screens offer *Try again* and *Back to the start* rather than dead-ending.

### 4. Consistency and standards

- One visual language across all three roles: the same card, the same button
  hierarchy, the same table treatment. A clinician and an administrator are
  looking at the same application.
- Primary actions are always solid brand; secondary always outlined. Nothing
  destructive is ever the primary button on a screen.
- Dates render through one formatter, so a time reads identically in an email, a
  notification and on screen.
- The sidebar is in the same place, with the same behaviour, for everybody.

### 5. Error prevention

Preferred to error messages throughout, and this is where most of the work went.

- **Only genuinely free times are offered.** The booking screen asks the API
  what is actually available rather than showing a grid and rejecting a
  collision afterwards.
- **Past days cannot be selected** — they are disabled in the calendar, not
  refused on submit.
- **Impossible dates are impossible to construct.** Paging from a 31-day month
  into a 30-day one brings the selected day back with it. (This was a real
  defect: the screen quietly asked about 31 September, and the server answered
  for the 30th.)
- **Prescriptions validate against a formulary** rather than accepting free text.
- **Import rejects bad rows individually**, naming the line and the field, and
  imports the good ones. One typo does not cost the file.
- The *Save* button stays disabled until something has actually changed.
- Uploads accept only images and PDFs, and say so before the file is chosen.

### 6. Recognition rather than recall

- The AI summary screen chooses a visit by *patient — reason — date*, never by
  id.
- Arriving from a patient record or the schedule carries the appointment with
  it, so nothing has to be remembered across screens.
- The patient record shows current medications, history, allergies and recent
  visits together — a clinician does not have to hold one screen in mind while
  reading another.
- Reminder settings show the clinic's default and say that it is the default,
  rather than presenting an empty form.

### 7. Flexibility and efficiency of use

- The patient directory is searchable by name, email **or presenting condition**,
  because staff think in all three.
- Search is debounced at 300 ms — responsive to a fast typist without a request
  per keystroke.
- Booking can start from the schedule, from a patient's record, or from the
  patient's own portal, because different people arrive at it differently.
- Export offers CSV, JSON and PDF: a spreadsheet, a system, and a person.

### 8. Aesthetic and minimalist design

- The chart shows recent history and says how much more exists, rather than
  every row a patient ever accumulated. (This was also a performance problem —
  see [PERFORMANCE.md](PERFORMANCE.md) — which is usually how over-disclosure
  shows up.)
- A printed prescription carries no navigation.
- Role-based navigation: a patient is never shown administrative screens they
  cannot open. This is a UX decision as much as a security one — the shortest
  menu that does the job.

### 9. Help users recognise, diagnose and recover from errors

- Messages say what happened and what to do: *"Nothing free that day. Try
  another date."* rather than *"Request failed."*
- Different failures read differently. *You do not have access to this* offers no
  retry, because retrying cannot help; *We could not load this* does, because it
  usually can.
- Every unexpected error carries a **reference id** the user can quote, which
  leads straight to the log line for that exact request.
- Import failures are reported per row, with the field named.
- A rendering crash shows a recoverable screen instead of a blank page.

### 10. Help and documentation

The weakest of the ten here, and worth saying so.

- Fields carry inline hints where the expectation is not obvious — *up to 4
  files, 5MB each*, *1 to 10*, *At least 8 characters*.
- The import screen documents its own file format, including which columns are
  optional and what happens to a row that already exists.
- **There is no help centre, no onboarding tour and no contextual help.** For a
  clinical system used daily by trained staff that is a defensible scope
  decision, but it is a gap rather than a deliberate strength.

---

## Design decisions, and why

**Three dashboards rather than one with permissions.** A shared dashboard would
have meant fewer screens to build. But a clinician opens the application to see
their day, an administrator to see the clinic's, and a patient to see their own
next appointment — three genuinely different first questions. One screen
answering all three answers none of them first.

**AI output is labelled everywhere it appears, and released deliberately.** The
patient-facing summary is written by a model and could be fluent and wrong. It
is marked as AI-generated, it is editable, and it does not reach the patient
until a clinician presses *Finalize & Release*. The extra step is the point: it
makes review a required action rather than an optional one.

**Identity fields are shown to patients but not editable.** A patient can
correct their phone and address; name, date of birth and health card number are
displayed with a note to ask the clinic. These are what a patient is matched on
at reception, and a self-service form is the wrong place to change them.

**The clinician picker is hidden when there is only one clinician.** A select
element with one option is a decision that isn't one.

**Times are shown without seconds.** They came out of the formatter as *9:00:00
a.m.* the first time notification bodies were rendered. Seconds on a diary entry
are noise.

### Where the build departs from the Figma frames

- **The patient dashboard's *view info* button** on the upcoming appointment is
  not implemented; the card is not clickable through to the visit.
- **The launch page's testimonial section** was drawn with claims about usage
  that are not true of a student project, and was not built as drawn.
- **Screens added beyond the designs**, because features arrived later than the
  frames: the invitation screen, reminder preferences, and the outstanding
  intake panel.

---

## Accessibility

What is genuinely there, counted from the source rather than claimed:

| | Count |
|---|---|
| Form inputs with associated `<label>` | 28 labels, 22 `htmlFor` |
| `aria-label` on controls without visible text | 10 |
| `aria-expanded` / `aria-hidden` / `aria-modal` | 4 |
| Screen-reader-only headings (`sr-only`) | 2 |
| Semantic landmarks (`section`, `nav`, `main`, `aside`) | 26 |
| Explicit `type="button"` (no accidental form submits) | 76 |
| Visible focus styles | 35 |
| Disabled states on unavailable actions | 40 |

Beyond the counts:

- Dialogs use `role="dialog"` with `aria-modal="true"` and an accessible name,
  close on **Escape**, and lock scrolling on the page behind them.
- Decorative content is `aria-hidden` — the bell glyph, the busy-day dots on the
  calendar — so it is not announced.
- The notification bell's label carries the unread count, so it reads as
  *"Notifications, 3 unread"* rather than *"button"*.
- Status is never communicated by colour alone: appointment states carry a text
  label as well as a tint.

### Known accessibility gaps

Stated rather than left to be found:

- **Dialogs do not trap focus**, and focus is not returned to the control that
  opened them on close. A keyboard user can tab out of an open dialog into the
  page behind it. This is the most significant gap.
- **No automated accessibility testing.** No axe or Lighthouse run is part of
  the build.
- **Colour contrast has not been measured** against WCAG AA. The palette is
  dark-on-light throughout and likely passes, but likely is not measured.
- **No skip-to-content link.**

---

## Prototype evaluation

> **Status: not yet run.** The instrument below is ready to use. This section is
> to be completed with real results before submission — the rubric asks for a
> completed prototype evaluation, and inventing one would be worse than having
> none.

### Method

Moderated task-based usability testing, **5 participants**. Five is the standard
number for formative testing: Nielsen's finding is that five users surface about
85% of usability problems, and a sixth mostly re-finds what the first five did.

Participants should not have used the system. Ask them to think aloud. Do not
help unless they are genuinely stuck — and record it when they are, because that
is the finding.

### Tasks

Each participant does all six, on the deployed application.

| # | Role | Task | Success is |
|---|---|---|---|
| 1 | Patient | Book an appointment for next week | A confirmed booking without assistance |
| 2 | Patient | Tell the clinic what is wrong before that visit | An intake form submitted |
| 3 | Patient | Find the summary of a past visit | Reaches Appointment Reports and reads one |
| 4 | Clinician | Find out what a named patient is being seen for, before they arrive | Opens the record or the AI brief |
| 5 | Clinician | Write up a visit and release the summary to the patient | Finalized and released |
| 6 | Admin | Add several patients from a file, and fix a row that was rejected | Corrects and re-imports successfully |

### What to record

For each task: **completed / completed with difficulty / not completed**, the
time taken, and every point of hesitation or wrong turn — verbatim where
possible. A participant saying *"I don't know if that worked"* is a
visibility-of-status finding, and the exact words are the evidence.

### After the tasks

The **System Usability Scale** — ten statements, each rated 1 (strongly
disagree) to 5 (strongly agree). It is short, standard, and produces a score
comparable to published benchmarks, where 68 is average.

1. I think that I would like to use this system frequently
2. I found the system unnecessarily complex
3. I thought the system was easy to use
4. I think that I would need the support of a technical person to be able to use this system
5. I found the various functions in this system were well integrated
6. I thought there was too much inconsistency in this system
7. I would imagine that most people would learn to use this system very quickly
8. I found the system very cumbersome to use
9. I felt very confident using the system
10. I needed to learn a lot of things before I could get going with this system

**Scoring:** odd-numbered items score (response − 1); even-numbered score
(5 − response); sum and multiply by 2.5 for a score out of 100.

### Recording the results

Fill in below and commit. A finding that led to a change should link the commit
that made it.

| Participant | Role tested | Tasks completed | SUS | Notable difficulty |
|---|---|---|---|---|
| P1 | | | | |
| P2 | | | | |
| P3 | | | | |
| P4 | | | | |
| P5 | | | | |

**Mean SUS:** _to be completed_

**Changes made in response:** _to be completed_
