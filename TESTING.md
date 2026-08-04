# Manual UI test plan

A walkthrough of every screen, in the order a person would actually use them,
with what you should see at each step. Written to be worked through with the
deployed application open — tick as you go.

**App:** https://intellicare-harsha-pilli-s-projects.vercel.app
**Sign-ins:** all use `Password123!`

| Role | Email |
|---|---|
| Clinician | `dr.kuteishi@intellicare.ca` |
| Admin | `admin@intellicare.ca` |
| Patient | `elias.tobias@example.com` |

> If you only have ten minutes, jump to [the demo-morning smoke test](#demo-morning-smoke-test).

---

## Before you start

- [ ] **Wake the API.** Open https://intellicare.onrender.com/api/health and wait
      for `{"status":"ok"}`. The free instance sleeps and the first request can
      take a minute — do this a few minutes before any demo so nobody watches a
      spinner.
- [ ] **Open three browsers or profiles**, one per role. Switching accounts live
      wastes time and invites a typo in front of an audience.
- [ ] **Check the deployed version.** Open https://intellicare.onrender.com/ — you
      should get a JSON block naming the service. If you get `Cannot GET /`,
      Render has not picked up the latest deploy.

---

## 1. Sign in and navigation

- [ ] Open the app while signed out — you should get the **launch page**, not a
      login form
- [ ] **Sign in as the patient.** Lands on the patient dashboard
- [ ] The sidebar shows exactly: Dashboard, Personal Information, Appointments,
      Appointment Reports
- [ ] Your name and **Patient** appear under the IntelliCare logo
- [ ] **Sign out** works and returns you to sign-in
- [ ] Sign in with a **wrong password** — the message says the credentials are
      invalid and does *not* say whether the email exists

**Watch for:** the sidebar showing anything belonging to another role.

---

## 2. Patient — the core journey

This is the spine of the demo. Everything else supports it.

### 2.1 Dashboard
- [ ] Three counts appear: booked appointments, past visits, refills due soon
- [ ] **Upcoming Appointment** names a clinician and a time
- [ ] If a summary has been released, a green banner offers **View Report**

### 2.2 Booking
- [ ] **Book an Appointment**
- [ ] The calendar opens on the current month
- [ ] **Past dates are greyed out and unclickable**
- [ ] Pick a future date — times appear underneath
- [ ] The times are real slots, not a fixed grid — book one, come back, and that
      time is gone
- [ ] Add a reason and **Confirm Appointment**
- [ ] A green success panel appears naming the clinician and the time

**Now the bug that was fixed — check it properly:**
- [ ] Click a day near the end of a 31-day month (say the 31st of a month that
      has one)
- [ ] Press the **next-month arrow** into a 30-day month
- [ ] **A real day should stay selected.** It must not silently ask about the
      31st of a 30-day month

### 2.3 Intake form
- [ ] **Appointments** → find your upcoming visit → **Intake form**
- [ ] Fill in what is troubling you
- [ ] **Type `7.5` into "How bad is it?"** → it should be refused *before*
      sending, saying it must be a whole number
- [ ] Change it to `7` — accepted
- [ ] Attach a photo (`.png`/`.jpg`) — accepted
- [ ] **Try attaching a `.txt` or `.html` file** → refused with *"Only images and
      PDFs can be attached"*
- [ ] Submit — a success message appears and the dialog closes

### 2.4 Reschedule and cancel
- [ ] **Reschedule** on an upcoming visit → a date field appears
- [ ] Change the date — **the field should keep focus and the list should not
      flash** (this was a real bug)
- [ ] Pick a new time — it moves
- [ ] **Cancel** an appointment — it moves to "Past and cancelled" with a
      *Cancelled* badge

### 2.5 Personal Information
- [ ] Change your **phone** and **address** → **Save changes** → success
- [ ] Reload — the change persisted
- [ ] **Name, date of birth and health card number are shown but not editable**
- [ ] **Appointment reminders** — tick different times, save, reload, they stuck
- [ ] Untick everything → a warning says you will not be reminded at all

### 2.6 Appointment Reports
- [ ] Each report is headed with **the date of the visit**, the clinician and the
      reason — *not* the date the summary was written
- [ ] Each carries an **AI-generated** badge

---

## 3. Clinician

### 3.1 Dashboard
- [ ] Three counts: Appointments, Writeups to Approve, Pending Reports
- [ ] The calendar marks days that have appointments with a dot
- [ ] Paging months backwards and forwards works

### 3.2 Schedule
- [ ] **Appointments** shows today's list
- [ ] **Previous / Today / Next** move the day
- [ ] Search by patient name filters the list
- [ ] **Request intake form** on a scheduled visit → prompt → confirmation
- [ ] Sign in as that patient and check **the request appears at the top of
      their dashboard**, quoting your note
- [ ] Mark a visit **Completed** or **No show** — the badge updates

### 3.3 Patient record
- [ ] **Patients** → the directory loads
- [ ] Search by **name**, and separately by **condition** — both work
- [ ] Filter by sex; pagination works
- [ ] Open a patient — demographics, medications, history, allergies, and
      previous appointments all appear
- [ ] If the patient has many visits, a line says how many of the total are shown

### 3.4 Prescribing
- [ ] **Prescribe medication**
- [ ] **Type into the medication field** — suggestions filter as you type
      (this is a text input now, not a dropdown)
- [ ] Type something not on the list, e.g. `Notarealdrug` → a warning appears
      immediately and **Issue** stays disabled
- [ ] Pick a real one — its form and route appear underneath
- [ ] Fill dosage, usage, duration; type **your own name** as the signature
- [ ] Issue it → appears in the patient's medication list
- [ ] **Print** → opens a clean sheet with **no navigation on it**

### 3.5 AI summaries
- [ ] **AI Summaries** → choose a visit by patient and date
- [ ] Any submitted intake appears above the brief
- [ ] **Generate** the pre-appointment brief → it names detail from the intake
- [ ] Press **Generate** again → returns instantly, says it loaded the existing one
- [ ] Type encounter notes → **Generate Summaries** → two summaries appear, both
      marked AI-generated
- [ ] **Switch the appointment dropdown** → **the notes box must empty.** If the
      previous patient's notes are still there, that is a serious bug
- [ ] Edit the patient-facing summary → **Finalize & Release**
- [ ] Sign in as that patient → the report is now visible to them

---

## 4. Admin

### 4.1 Dashboard and appointments
- [ ] Counts appear: appointments today, awaiting follow-up, no-shows, patients
- [ ] **Appointments** shows the whole clinic's day, across clinicians
- [ ] **Book for a patient** → choose patient, clinician, date, time → books
- [ ] **Attended** / **No show** update the record

### 4.2 Adding a patient
- [ ] **Add Patient**
- [ ] **Submit it empty** → it should refuse *without* contacting the server and
      mark the missing fields
- [ ] Enter a malformed email → refused
- [ ] Enter a password under 8 characters → refused
- [ ] Enter a **future date of birth** → refused
- [ ] Fill it in properly → the patient is created and you land on their record

### 4.3 Import
- [ ] **Patients** → **Import Patients**
- [ ] Save this as `patients.csv`:

```csv
name,email,phone,sex,medicalHistory
Ada Lovelace,ada.test@example.com,9025550100,Female,Asthma
Bad Row,not-an-email,9025550101,Female,
```

- [ ] Upload it → **1 added, 1 rejected**, and the rejected row names the field
      and the reason
- [ ] The added patient shows an **invitation link** (not a password)
- [ ] **Change the phone number in the file and upload it again** → the row now
      reports as **updated**, naming which fields moved
- [ ] Open Ada's record → the phone changed, but **sex and medical history are
      still there** (the second file did not mention them)

### 4.4 Invitations
- [ ] Open the imported patient → **Send invitation**
- [ ] Copy the link → open it in a **private/incognito window**
- [ ] You are greeted by name and asked to choose a password
- [ ] Set one → you are signed straight in as that patient
- [ ] **Go back and open the same link again** → it should say the invitation is
      no longer valid

### 4.5 Export
- [ ] On any patient → **Export** → CSV, JSON and PDF each download
- [ ] Open the PDF — it is readable and contains the patient's details

---

## 5. Sign-up (recently fixed — check it carefully)

- [ ] Sign out. On the sign-in page, click **Click here** to create a profile
- [ ] **Mismatch the two passwords** → refused before sending
- [ ] Use a password under 8 characters → refused
- [ ] Register properly with a fresh email
- [ ] **You should land on a working dashboard.** If it says *"We could not find
      your dashboard"*, the fix is not deployed
- [ ] Check every patient screen loads: Personal Information, Appointments,
      Appointment Reports
- [ ] Book an appointment from the new account

---

## 6. Errors and edge cases

- [ ] Sign in as a patient, then edit the URL to `/admin` → you are sent back to
      your own area, not shown the admin screen
- [ ] Open a patient id that does not exist, e.g. `/clinician/patients/999999` →
      a clear message with a **Try again** button, not a blank screen
- [ ] Open a deep link directly, e.g. `/patient/details` → it loads (does not 404)
- [ ] **Turn off wifi**, then open a screen → it should say it could not load and
      offer **Try again**. Turn wifi back on and press it → it recovers
- [ ] Open `/invite/rubbish` → says the invitation is no longer valid

---

## Things that are *not* bugs

Do not spend demo time chasing these.

| What you will see | Why |
|---|---|
| **No email ever arrives** | Render's free tier blocks outbound SMTP. Invitations and reminders are created and shown in-app; delivery is documented in [SECURITY.md](SECURITY.md) and [README.md](README.md#known-limitations) |
| **First request takes ~50 seconds** | The free instance sleeps when idle. Wake it beforehand |
| `intellicare.onrender.com` shows JSON | That is the API, not the app. Correct behaviour |
| A cancelled appointment for Elias Tobias called "Post-fix booking check" | Left over from testing. Harmless |
| Several clinicians named "New Clinician" | Only in the local dev database, not in the deployed one |

---

## Demo-morning smoke test

Ten minutes, the morning of. If these pass, the demo will hold.

1. [ ] **Wake the API** — https://intellicare.onrender.com/api/health returns ok
2. [ ] Sign in as **each of the three roles** — all three land on their dashboard
3. [ ] **Patient books an appointment** — completes end to end
4. [ ] **Patient submits an intake form** — accepted
5. [ ] **Clinician generates a pre-appointment brief** — text comes back
6. [ ] **Clinician finalizes and releases a summary** — patient can see it
7. [ ] **Admin imports the two-row CSV** — 1 added, 1 rejected with a reason
8. [ ] **Open an invitation link** — the set-password screen appears
9. [ ] No screen shows a blank page or a raw error

If any of these fail, the fastest fixes are usually:

- **Everything fails** → the API is asleep or Render is mid-deploy. Check
  `/api/health`
- **A screen is blank** → hard-reload (`Ctrl+Shift+R`); Vercel may have served a
  cached bundle
- **Something looks stale** → check Render deployed the latest commit

---

## Recording what you find

If something is wrong, note **which screen, what you did, and what you expected**
— and grab the **reference id** if an error shows one. Every unexpected error
carries one, and it leads straight to the log line for that exact request.
