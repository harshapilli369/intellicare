const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

const { SEEDED, get, login, requireRunningApi, daysFromNow, asDate } = require('./helpers');

describe('Clinician dashboard', () => {
  let clinician;
  let admin;
  let patient;
  let dashboard;

  before(async () => {
    await requireRunningApi();
    clinician = await login(SEEDED.clinician);
    admin = await login(SEEDED.admin);
    patient = await login(SEEDED.patient);

    dashboard = (await get('/dashboard/clinician', clinician.token)).json;
  });

  it('is clinician only', async () => {
    assert.equal((await get('/dashboard/clinician', admin.token)).status, 403);
    assert.equal((await get('/dashboard/clinician', patient.token)).status, 403);
    assert.equal((await get('/dashboard/clinician', null)).status, 401);
  });

  it('returns everything the screen renders', async () => {
    assert.equal(typeof dashboard.counts.appointmentsToday, 'number');
    assert.equal(typeof dashboard.counts.writeupsToApprove, 'number');
    assert.equal(typeof dashboard.counts.pendingReports, 'number');
    assert.ok(Array.isArray(dashboard.today));
    assert.ok(Array.isArray(dashboard.busyDays));
    assert.ok('upcoming' in dashboard);
  });

  it("today's list carries what each row shows, in time order", () => {
    assert.ok(dashboard.today.every((a) => !!a.patientName), 'a name');
    assert.ok(dashboard.today.every((a) => !!a.patientId), 'a patient to open');
    assert.ok(dashboard.today.every((a) => !!a.scheduledAt), 'a time');

    const times = dashboard.today.map((a) => new Date(a.scheduledAt).getTime());
    assert.deepEqual(times, [...times].sort((a, b) => a - b));
  });

  it('counts today against the list it returns', () => {
    const active = dashboard.today.filter((a) => a.status !== 'cancelled').length;
    assert.equal(dashboard.counts.appointmentsToday, active);
  });

  it('the upcoming appointment is in the future and still scheduled', () => {
    if (!dashboard.upcoming) return;
    assert.equal(dashboard.upcoming.status, 'scheduled');
    assert.ok(new Date(dashboard.upcoming.scheduledAt).getTime() > Date.now());
    assert.ok(dashboard.upcoming.patientName);
  });

  it('marks the days of the month that have appointments', async () => {
    assert.ok(dashboard.busyDays.every((day) => Number.isInteger(day) && day >= 1 && day <= 31));

    // Checked against the appointments that actually exist this month, rather
    // than against "today". The seed books visits on the day it is run, so an
    // assertion about today only holds on the day somebody seeded - this failed
    // two days after seeding, which is a fact about the fixture and not about
    // the calendar.
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const { json } = await get(
      `/appointments?clinicianId=${clinician.user.id}&from=${asDate(first)}&to=${asDate(last)}`,
      clinician.token
    );

    const daysWithVisits = new Set(
      json.appointments
        .filter((a) => a.status !== 'cancelled')
        .map((a) => new Date(a.scheduledAt).getDate())
    );

    for (const day of daysWithVisits) {
      assert.ok(dashboard.busyDays.includes(day), `day ${day} has visits and must be marked`);
    }
  });

  it('answers for another month without complaint', async () => {
    const { status, json } = await get('/dashboard/clinician?month=2020-01', clinician.token);
    assert.equal(status, 200);
    assert.equal(json.month, '2020-01');
    assert.deepEqual(json.busyDays, [], 'a month with nothing in it is simply empty');
  });

  it('rejects a malformed month', async () => {
    assert.equal((await get('/dashboard/clinician?month=nonsense', clinician.token)).status, 400);
  });

  describe('the patient side', () => {
    let mine;

    before(async () => {
      mine = (await get('/dashboard/patient', patient.token)).json;
    });

    it('is patient only', async () => {
      assert.equal((await get('/dashboard/patient', clinician.token)).status, 403);
      assert.equal((await get('/dashboard/patient', admin.token)).status, 403);
      assert.equal((await get('/dashboard/patient', null)).status, 401);
    });

    it('returns the counts and the patient record id, which is not the account id', async () => {
      assert.equal(typeof mine.counts.bookedAppointments, 'number');
      assert.equal(typeof mine.counts.refillsDueSoon, 'number');
      assert.equal(typeof mine.counts.summariesAvailable, 'number');
      assert.equal(typeof mine.pastVisits, 'number');
      assert.ok(mine.patientId > 0);
      assert.notEqual(mine.patientId, patient.user.id, 'the profile id differs from the account id');
    });

    it('counts only appointments that belong to this patient', async () => {
      // Two endpoints cannot be read as one instant, and other test files book
      // and cancel against this same patient in parallel, so the two readings
      // can legitimately straddle a change. Disagreeing twice in a row is not
      // something a concurrent booking explains, so that is the failure worth
      // reporting; a single disagreement is retried rather than believed.
      const readBoth = async () => {
        const [dash, listed] = await Promise.all([
          get('/dashboard/patient', patient.token),
          get('/appointments', patient.token),
        ]);
        return {
          counted: dash.json.counts.bookedAppointments,
          scheduled: listed.json.appointments.filter((a) => a.status === 'scheduled').length,
          all: listed.json.appointments,
        };
      };

      let reading = await readBoth();
      if (reading.counted !== reading.scheduled) reading = await readBoth();

      assert.equal(reading.counted, reading.scheduled);
      assert.ok(
        reading.all.every((a) => a.patientId === mine.patientId),
        'and every appointment counted belongs to this patient'
      );
    });

    it('names the clinician on the upcoming appointment, which is what the card shows', () => {
      if (!mine.upcoming) return;
      assert.ok(mine.upcoming.clinicianName);
      assert.ok(new Date(mine.upcoming.scheduledAt).getTime() > Date.now());
    });

    it('counts only released summaries, never drafts', async () => {
      const [fresh, released] = await Promise.all([
        get('/dashboard/patient', patient.token),
        get(`/ai/patient/${mine.patientId}/summaries`, patient.token),
      ]);

      assert.equal(fresh.json.counts.summariesAvailable, released.json.summaries.length);
      assert.ok(
        released.json.summaries.every((s) => s.finalized),
        'nothing unreleased reaches the patient'
      );
    });
  });

  describe('the administrative side', () => {
    let clinic;

    before(async () => {
      clinic = (await get('/dashboard/admin', admin.token)).json;
    });

    it('is admin only', async () => {
      assert.equal((await get('/dashboard/admin', clinician.token)).status, 403);
      assert.equal((await get('/dashboard/admin', patient.token)).status, 403);
      assert.equal((await get('/dashboard/admin', null)).status, 401);
    });

    it('returns the counts the screen shows', () => {
      for (const key of ['appointmentsToday', 'awaitingFollowUp', 'noShowsToday', 'patients']) {
        assert.equal(typeof clinic.counts[key], 'number', `${key} is a number`);
      }
      assert.ok(Array.isArray(clinic.today));
      assert.ok(Array.isArray(clinic.busyDays));
    });

    it('counts every patient on the books', async () => {
      const [fresh, directory] = await Promise.all([
        get('/dashboard/admin', admin.token),
        get('/patients?limit=100', admin.token),
      ]);
      assert.equal(fresh.json.counts.patients, directory.json.total);
    });

    it('shows the whole clinic, not one clinician', async () => {
      const mine = (await get('/dashboard/clinician', clinician.token)).json;
      assert.ok(
        clinic.today.length >= mine.today.length,
        "the clinic's day includes at least this clinician's"
      );
      assert.ok(clinic.today.every((a) => !!a.clinicianName), 'each row names who is seeing them');
    });

    it('names the patient and offers a record to open on every row', () => {
      assert.ok(clinic.today.every((a) => !!a.patientName && !!a.patientId));
    });

    it('rejects a malformed month', async () => {
      assert.equal((await get('/dashboard/admin?month=nope', admin.token)).status, 400);
    });
  });

  describe('the clinicians list used for booking', () => {
    it('is available to staff and returns names', async () => {
      const { status, json } = await get('/users/clinicians', admin.token);
      assert.equal(status, 200);
      assert.ok(json.clinicians.length > 0);
      assert.ok(json.clinicians.every((c) => c.id && c.name));
    });

    it('exposes nothing beyond an id and a name', async () => {
      const { json } = await get('/users/clinicians', admin.token);
      const keys = Object.keys(json.clinicians[0]).sort();
      assert.deepEqual(keys, ['id', 'name'], 'no email, no hash, no role');
    });

    // A patient chooses who to book with, so the picker has to reach them. It
    // was staff-only, which left the booking screen unable to name a single
    // clinician and so unable to offer a time at all.
    it('is available to a patient, who books their own visits', async () => {
      const { status, json } = await get('/users/clinicians', patient.token);
      assert.equal(status, 200);
      assert.ok(json.clinicians.length > 0, 'a patient can see who to book with');
    });

    it('tells a patient no more than it tells staff', async () => {
      // Read together: other test files register staff in parallel, so two
      // reads taken apart can legitimately disagree about how many exist.
      const [mine, theirs] = await Promise.all([
        get('/users/clinicians', patient.token),
        get('/users/clinicians', admin.token),
      ]);

      const asPatient = mine.json.clinicians;
      assert.deepEqual(
        Object.keys(asPatient[0]).sort(),
        ['id', 'name'],
        'no email, no hash, no role'
      );
      assert.deepEqual(
        asPatient,
        theirs.json.clinicians,
        'the same picker, not a privileged view'
      );
    });

    it('is closed to anyone not signed in', async () => {
      assert.equal((await get('/users/clinicians', null)).status, 401);
    });
  });

  it("shows only this clinician's day", async () => {
    // Read together, not against the snapshot from `before`: other test files
    // book and cancel for this clinician in parallel, so two reads taken apart
    // legitimately disagree.
    const [fresh, mine] = await Promise.all([
      get('/dashboard/clinician', clinician.token),
      get(
        `/appointments?clinicianId=${clinician.user.id}&from=${daysFromNow(0)}&to=${daysFromNow(0)}`,
        clinician.token
      ),
    ]);

    const ids = mine.json.appointments.map((a) => a.id).sort();
    assert.deepEqual(fresh.json.today.map((a) => a.id).sort(), ids);
  });
});
