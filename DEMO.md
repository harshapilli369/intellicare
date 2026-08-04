# Demonstration script

Fifteen minutes, three roles, one thread running through it: a patient books,
tells the clinic what is wrong, is seen, and reads back what happened.

Sign-in details are in the [README](README.md#seed-data-and-accounts). Everything
below is on the deployed site.

---

## Before you start

**Wake the API.** The free Render instance sleeps, and the first request after a
quiet period takes up to a minute. Open
https://intellicare.onrender.com/api/health a few minutes beforehand so nobody
watches a spinner.

**Have three browser profiles or windows open**, one signed in as each role.
Switching accounts live wastes time and invites a typo.

**Reseed if the data has drifted:** `npm run seed --prefix backend`.

---

## 1. The patient books (3 min)

Sign in as **`elias.tobias@example.com`**.

1. **Dashboard** — booked appointments, past visits, refills due soon, and the
   next appointment with its clinician.
2. **Book an appointment** — pick a day, and note that past days cannot be
   chosen. Pick a time; the times offered are what that clinician actually has
   free, not a fixed list.
3. Confirm. The clinician is notified straight away.

> **Worth saying:** two people asking for the same slot at the same instant is a
> real problem, not a hypothetical one. Booking takes an exclusive lock on the
> clinician's diary, and there is a test that fires eight simultaneous bookings
> at one slot and asserts exactly one succeeds.

## 2. The clinic asks for details (2 min)

Sign in as **`dr.kuteishi@intellicare.ca`**.

1. **Appointments** — the day's schedule.
2. Find the visit just booked, press **Request intake form**, and type something
   you would actually want to know.

Back as the patient:

3. The **dashboard** now leads with the request, quoting what was asked.
4. **Appointments → Intake form.** Fill it in — complaint, how long, severity,
   what they have taken. Attach a photograph if you like.
5. Submit. The request disappears from the dashboard: it has been answered.

## 3. The AI brief (3 min)

As the clinician:

1. **AI Summaries**, choose that visit.
2. The intake answers are shown above the brief — this is what the model reads,
   alongside the patient's history, medications and previous notes.
3. **Generate.** The brief names the intake detail explicitly, under its own
   heading.
4. Press **Generate** again — it returns instantly and says it loaded the
   existing brief. The summary is cached against a hash of its inputs.

> **Worth saying:** the browser never talks to Gemini. The key stays on the
> server, the prompt is assembled server-side from the patient's own record, and
> nobody can send arbitrary text to the model. Change an input — submit new
> intake — and the cache is invalidated rather than serving a stale brief.

## 4. The visit, written up (3 min)

Still as the clinician:

1. Type encounter notes in **Post-Appointment Summaries** and generate.
2. Two summaries come back: one clinical, one in plain language. Both are
   labelled as AI-generated.
3. **Edit the patient-facing one.** This is the point — a clinician reviews and
   corrects before anything reaches a patient.
4. **Finalize & Release.**

As the patient:

5. **Appointment Reports** — the released summary, headed with the date of the
   visit, the clinician, and the reason.

> **Worth showing:** switch the appointment dropdown on the AI Summaries screen
> and the notes box empties. It used to carry over, which meant one patient's
> clinical detail could become the basis of another patient's summary — in prose
> fluent enough that review would not catch it.

## 5. Administration (3 min)

Sign in as **`admin@intellicare.ca`**.

1. **Patients → Import Patients.** Upload a small CSV:

   ```csv
   name,email,phone,sex,medicalHistory
   Ada Lovelace,ada@example.com,9025550100,Female,Asthma
   Not An Email,nope,9025550101,Female,
   ```

   One row is added, one rejected with the field and reason named. No password
   is invented for anyone — the added patient gets an invitation link instead.

2. **Import the same file again with a changed phone number.** The row now
   reports as *updated*, and names which fields moved. Columns the file leaves
   out are untouched.

3. Open the new patient and press **Send invitation**. Copy the link, open it in
   a private window: the patient is greeted by name and chooses their own
   password. Use the link a second time — it is spent.

4. **Export** any chart as PDF.

> **Worth saying:** every export, import and invitation is written to an audit
> log. And no temporary password exists at any point — an account is unusable
> until its patient sets one.

## 6. Self-service and reminders (1 min)

As the patient, **Personal Information**:

1. Correct a phone number or address — a patient can fix how the clinic reaches
   them.
2. Name, date of birth and health card number are shown but not editable: those
   identify them at reception, so correcting one is a conversation at the desk.
3. **Appointment reminders** — choose different hours, or turn them off. Until a
   patient chooses, the clinic's own schedule applies and the screen says so.

---

## The question you will be asked

**"Does the email actually send?"**

No, and the reason is worth giving straight:

> Render's free tier blocks outbound SMTP on ports 25, 465 and 587 as policy, to
> stop the tier being used for spam. It blocks by swallowing the connection
> rather than refusing it, so a send hangs and then reports a connection
> timeout — which looks like a credentials problem and is not. The same Gmail
> App Password delivers in under three seconds from a developer machine.
>
> So the mail service picks its transport from configuration: an HTTP provider
> when one is set, SMTP when it is not, a reported skip when neither is. Setting
> two environment variables, or moving to a paid instance, switches delivery on
> with no code change.

Everything downstream of the send works and is demonstrable: the invitation is
created, the link works, the in-app notification arrives, the reminder scan runs
and records what it did.

If you have a screenshot of a real invitation email sent from a local run, show
it here.

---

## Other things worth having an answer to

**"How do you know the tests are any good?"** They run against a live server and
real databases, not mocks. Three examples of things that only show up that way:
the booking race, a query that broke once the directory passed a hundred rows,
and a rate limiter that counted every user as one caller because the app did not
trust its proxy.

**"What would you do next?"** Point a security scanner at the deployment; add
component tests for the React side, which has none; and configure a mail
provider so invitations and reminders deliver end to end.

**"Is anything not finished?"** The [known limitations](README.md#known-limitations)
section says so plainly. Better to name them than be found out by a question.
