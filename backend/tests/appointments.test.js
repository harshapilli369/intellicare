const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');


const {
  SEEDED,
  get,
  post,
  patch,
  login,
  requireRunningApi,
  daysFromNow,
  patientIdFor,
} = require('./helpers');

describe('Appointments', () => {
  let clinician;
  let admin;
  let patient;
  let eliasId;
  let otherId;
  let day;
  let slots;

  // Booking runs far enough ahead to stay outside the change window, and each
  // run picks its own day so repeated runs do not compete for the same slots.
  const pickDay = () => daysFromNow(30 + Math.floor(Math.random() * 120));

  before(async () => {
    await requireRunningApi();
    clinician = await login(SEEDED.clinician);
    admin = await login(SEEDED.admin);
    patient = await login(SEEDED.patient);
    eliasId = await patientIdFor(clinician.token, 'Elias Tobias');
    otherId = await patientIdFor(clinician.token, 'Sam Smith');

    day = pickDay();
    const { json } = await get(
      `/appointments/availability?clinicianId=${clinician.user.id}&date=${day}`,
      admin.token
    );
    slots = json.slots;
  });

  describe('availability', () => {
    it('offers the clinic slots for the day', async () => {
      assert.ok(slots.length > 0);

      const times = slots.map((slot) => new Date(slot));
      assert.ok(
        times.every((time) => time.getHours() >= 9 && time.getHours() < 17),
        'every slot is inside clinic hours'
      );
      assert.ok(
        times.every((time) => time.getMinutes() % 30 === 0),
        'every slot sits on the half hour'
      );
    });

    it('answers 404 for a clinician that does not exist', async () => {
      const { status } = await get(
        `/appointments/availability?clinicianId=999999&date=${day}`,
        admin.token
      );
      assert.equal(status, 404);
    });

    it('requires a date', async () => {
      const { status } = await get(
        `/appointments/availability?clinicianId=${clinician.user.id}`,
        admin.token
      );
      assert.equal(status, 400);
    });

    // A date of the right shape but no such day used to be accepted, and
    // `new Date` rolled it back a day: the caller asked about the 31st and was
    // quietly answered about the 30th, then booked into it.
    it('refuses a day that does not exist rather than rolling it back', async () => {
      const impossible = ['2026-09-31', '2026-04-31', '2026-02-30', '2025-02-29'];

      for (const date of impossible) {
        const { status } = await get(
          `/appointments/availability?clinicianId=${clinician.user.id}&date=${date}`,
          admin.token
        );
        assert.equal(status, 400, `${date} is not a day and must not be answered`);
      }
    });

    it('still accepts the last real day of a short month', async () => {
      const { status } = await get(
        `/appointments/availability?clinicianId=${clinician.user.id}&date=2026-09-30`,
        admin.token
      );
      assert.equal(status, 200);
    });
  });

  describe('reading one appointment', () => {
    it('returns it with both names, so a screen can say whose visit it is', async () => {
      const booked = await post('/appointments', admin.token, {
        clinicianId: clinician.user.id,
        patientId: eliasId,
        scheduledAt: slots[13],
        reason: 'Read by id',
      });
      const id = booked.json.appointment.id;

      const { status, json } = await get(`/appointments/${id}`, clinician.token);
      assert.equal(status, 200);
      assert.equal(json.appointment.id, id);
      assert.equal(json.appointment.patientName, 'Elias Tobias');
      assert.equal(json.appointment.clinicianName, 'Mariam Kuteishi');
      assert.equal(json.appointment.reason, 'Read by id');

      assert.equal(
        (await get(`/appointments/${id}`, patient.token)).status,
        200,
        'the patient it belongs to can read it'
      );

      await patch(`/appointments/${id}/cancel`, admin.token);
    });

    it("refuses a patient another patient's appointment", async () => {
      const booked = await post('/appointments', admin.token, {
        clinicianId: clinician.user.id,
        patientId: otherId,
        scheduledAt: slots[14],
      });
      const id = booked.json.appointment.id;

      assert.equal((await get(`/appointments/${id}`, patient.token)).status, 403);
      await patch(`/appointments/${id}/cancel`, admin.token);
    });

    it('answers 404 for one that does not exist and 400 for a malformed id', async () => {
      assert.equal((await get('/appointments/999999', clinician.token)).status, 404);
      assert.equal((await get('/appointments/abc', clinician.token)).status, 400);
    });

    it('does not swallow the availability path', async () => {
      const { status } = await get(
        `/appointments/availability?clinicianId=${clinician.user.id}&date=${day}`,
        clinician.token
      );
      assert.equal(status, 200, '/availability still routes to availability, not to :id');
    });
  });

  describe('booking', () => {
    it('books for the patient making the request and takes the slot out of circulation', async () => {
      const slot = slots[0];
      const { status, json } = await post('/appointments', patient.token, {
        clinicianId: clinician.user.id,
        scheduledAt: slot,
        reason: 'Annual review',
      });

      assert.equal(status, 201);
      assert.equal(json.appointment.patientId, eliasId);
      assert.equal(json.appointment.status, 'scheduled');
      assert.equal(json.appointment.patientName, 'Elias Tobias');
      assert.equal(json.appointment.clinicianName, 'Mariam Kuteishi');

      const after = await get(
        `/appointments/availability?clinicianId=${clinician.user.id}&date=${day}`,
        admin.token
      );
      assert.ok(!after.json.slots.includes(slot));

      await patch(`/appointments/${json.appointment.id}/cancel`, patient.token);
    });

    it('refuses to book a time on a day that does not exist', async () => {
      const { status } = await post('/appointments', patient.token, {
        clinicianId: clinician.user.id,
        scheduledAt: '2026-09-31T14:00:00.000Z',
        reason: 'A day that never comes',
      });

      assert.equal(status, 400, 'the 31st of September is not a time to be booked into');
    });

    it('refuses a second booking of the same slot', async () => {
      const slot = slots[1];
      const first = await post('/appointments', admin.token, {
        clinicianId: clinician.user.id,
        patientId: eliasId,
        scheduledAt: slot,
      });
      assert.equal(first.status, 201);

      const second = await post('/appointments', admin.token, {
        clinicianId: clinician.user.id,
        patientId: otherId,
        scheduledAt: slot,
      });
      assert.equal(second.status, 409);

      await patch(`/appointments/${first.json.appointment.id}/cancel`, admin.token);
    });

    it('ignores a patient asking to book for someone else', async () => {
      const { json } = await post('/appointments', patient.token, {
        clinicianId: clinician.user.id,
        patientId: otherId,
        scheduledAt: slots[2],
      });

      assert.equal(json.appointment.patientId, eliasId);
      await patch(`/appointments/${json.appointment.id}/cancel`, patient.token);
    });

    it('lets an administrator book on a patient behalf', async () => {
      const { json } = await post('/appointments', admin.token, {
        clinicianId: clinician.user.id,
        patientId: otherId,
        scheduledAt: slots[3],
        reason: 'Booked by reception',
      });

      assert.equal(json.appointment.patientId, otherId);
      await patch(`/appointments/${json.appointment.id}/cancel`, admin.token);
    });

    it('refuses times the clinic does not run', async () => {
      const outside = await post('/appointments', admin.token, {
        clinicianId: clinician.user.id,
        patientId: otherId,
        scheduledAt: `${day}T03:00:00`,
      });
      assert.equal(outside.status, 400);

      const unaligned = await post('/appointments', admin.token, {
        clinicianId: clinician.user.id,
        patientId: otherId,
        scheduledAt: `${day}T09:07:00`,
      });
      assert.equal(unaligned.status, 400);
    });

    it('refuses a time in the past', async () => {
      const { status } = await post('/appointments', admin.token, {
        clinicianId: clinician.user.id,
        patientId: otherId,
        scheduledAt: '2020-01-01T09:00:00',
      });
      assert.equal(status, 400);
    });

    it('only one of several simultaneous bookings wins the slot', async () => {
      const slot = slots[4];

      const attempts = await Promise.all(
        Array.from({ length: 8 }, () =>
          post('/appointments', admin.token, {
            clinicianId: clinician.user.id,
            patientId: eliasId,
            scheduledAt: slot,
          })
        )
      );

      const statuses = attempts.map((attempt) => attempt.status);
      const created = attempts.filter((attempt) => attempt.status === 201);
      const refused = attempts.filter((attempt) => attempt.status === 409);

      assert.equal(created.length, 1, `exactly one booking succeeds, got ${statuses.join()}`);
      assert.equal(
        refused.length,
        7,
        `the rest are refused as already booked, got ${statuses.join()}`
      );

      // The losers must be turned away cleanly. Contention used to starve the
      // connection pool and surface as a server error instead.
      assert.ok(
        statuses.every((status) => status < 500),
        `no request fails with a server error, got ${statuses.join()}`
      );

      await patch(`/appointments/${created[0].json.appointment.id}/cancel`, admin.token);
    });
  });

  describe('changing a booking', () => {
    it('moves an appointment and releases the slot it left', async () => {
      const from = slots[5];
      const to = slots[6];

      const booked = await post('/appointments', patient.token, {
        clinicianId: clinician.user.id,
        scheduledAt: from,
      });
      const id = booked.json.appointment.id;

      const moved = await patch(`/appointments/${id}/reschedule`, patient.token, { scheduledAt: to });
      assert.equal(moved.status, 200);

      const availability = await get(
        `/appointments/availability?clinicianId=${clinician.user.id}&date=${day}`,
        admin.token
      );
      assert.ok(availability.json.slots.includes(from), 'the old slot is free again');
      assert.ok(!availability.json.slots.includes(to), 'the new slot is taken');

      await patch(`/appointments/${id}/cancel`, patient.token);
    });

    it("refuses to move another patient's appointment", async () => {
      const booked = await post('/appointments', admin.token, {
        clinicianId: clinician.user.id,
        patientId: otherId,
        scheduledAt: slots[7],
      });

      const { status } = await patch(
        `/appointments/${booked.json.appointment.id}/reschedule`,
        patient.token,
        { scheduledAt: slots[8] }
      );
      assert.equal(status, 403);

      await patch(`/appointments/${booked.json.appointment.id}/cancel`, admin.token);
    });

    it('cancels, frees the slot, and refuses to cancel twice', async () => {
      const slot = slots[9];
      const booked = await post('/appointments', patient.token, {
        clinicianId: clinician.user.id,
        scheduledAt: slot,
      });
      const id = booked.json.appointment.id;

      const cancelled = await patch(`/appointments/${id}/cancel`, patient.token);
      assert.equal(cancelled.status, 200);
      assert.equal(cancelled.json.appointment.status, 'cancelled');

      const availability = await get(
        `/appointments/availability?clinicianId=${clinician.user.id}&date=${day}`,
        admin.token
      );
      assert.ok(availability.json.slots.includes(slot));

      assert.equal((await patch(`/appointments/${id}/cancel`, patient.token)).status, 409);
      assert.equal(
        (await patch(`/appointments/${id}/reschedule`, patient.token, { scheduledAt: slots[10] }))
          .status,
        409,
        'a cancelled appointment cannot be moved'
      );
    });

    it('will not change an appointment inside the change window', async () => {
      const todaysList = await get(
        `/appointments?clinicianId=${clinician.user.id}&from=${daysFromNow(0)}&to=${daysFromNow(0)}`,
        clinician.token
      );
      const soon = todaysList.json.appointments.find((a) => a.status === 'scheduled');

      if (!soon) {
        // The seed puts visits on the current day; without one there is nothing
        // close enough to exercise the window.
        return;
      }

      const { status } = await patch(`/appointments/${soon.id}/cancel`, admin.token);
      assert.equal(status, 409);
    });
  });

  describe('what the clinician is told', () => {
    // A day of its own. The shared `slots` are largely spoken for by the tests
    // above, and a clinic day only has as many slots as it has half hours.
    let ownDay;
    let ownSlots;

    before(async () => {
      ownDay = pickDay();
      ownSlots = (
        await get(
          `/appointments/availability?clinicianId=${clinician.user.id}&date=${ownDay}`,
          admin.token
        )
      ).json.slots;
      assert.ok(ownSlots.length >= 2, 'the test needs at least two free times');
    });

    const unreadTitles = async (token) =>
      (await get('/notifications', token)).json.notifications.map((n) => n.title);

    it('raises a notification when a patient books, and when they cancel', async () => {
      const booked = await post('/appointments', patient.token, {
        clinicianId: clinician.user.id,
        scheduledAt: ownSlots[0],
        reason: 'Notification check',
      });
      const id = booked.json.appointment.id;

      const afterBooking = await unreadTitles(clinician.token);
      assert.ok(
        afterBooking.some((title) => title.includes('New appointment')),
        'the clinician hears about a booking they did not make'
      );

      await patch(`/appointments/${id}/cancel`, patient.token);

      const afterCancel = await unreadTitles(clinician.token);
      assert.ok(
        afterCancel.some((title) => title.includes('Cancelled')),
        'and about it being cancelled'
      );
    });

    it('does not tell the patient about their own action', async () => {
      const booked = await post('/appointments', patient.token, {
        clinicianId: clinician.user.id,
        scheduledAt: ownSlots[1],
      });
      assert.equal(booked.status, 201);

      // Counting everything the patient has would be at the mercy of other test
      // files raising notifications for the same account, so this asks the
      // precise question: was a booking notice addressed to the person who
      // booked?
      const { json } = await get('/notifications', patient.token);
      const ownActions = json.notifications.filter((n) =>
        ['appointment-booked', 'appointment-cancelled'].includes(n.kind)
      );
      assert.deepEqual(ownActions, [], 'nobody needs telling what they just did themselves');

      await patch(`/appointments/${booked.json.appointment.id}/cancel`, patient.token);
    });
  });

  describe('visibility and status', () => {
    it('shows one appointment to its patient, its clinician and an admin', async () => {
      const booked = await post('/appointments', patient.token, {
        clinicianId: clinician.user.id,
        scheduledAt: slots[11],
      });
      const id = booked.json.appointment.id;

      const asPatient = await get('/appointments', patient.token);
      const asClinician = await get(`/appointments?clinicianId=${clinician.user.id}`, clinician.token);
      const asAdmin = await get('/appointments', admin.token);

      assert.ok(asPatient.json.appointments.some((a) => a.id === id));
      assert.ok(asClinician.json.appointments.some((a) => a.id === id));
      assert.ok(asAdmin.json.appointments.some((a) => a.id === id));

      await patch(`/appointments/${id}/cancel`, patient.token);
    });

    it('shows a patient only their own', async () => {
      const { json } = await get('/appointments', patient.token);
      assert.ok(json.appointments.every((a) => a.patientId === eliasId));
    });

    it('records how a visit turned out, staff only', async () => {
      const booked = await post('/appointments', admin.token, {
        clinicianId: clinician.user.id,
        patientId: otherId,
        scheduledAt: slots[12],
      });
      const id = booked.json.appointment.id;

      assert.equal(
        (await patch(`/appointments/${id}/status`, patient.token, { status: 'no_show' })).status,
        403
      );

      const completed = await patch(`/appointments/${id}/status`, clinician.token, {
        status: 'completed',
      });
      assert.equal(completed.json.appointment.status, 'completed');

      const noShow = await patch(`/appointments/${id}/status`, clinician.token, {
        status: 'no_show',
      });
      assert.equal(noShow.json.appointment.status, 'no_show');

      assert.equal(
        (await patch(`/appointments/${id}/status`, clinician.token, { status: 'cancelled' })).status,
        400,
        'cancelling goes through its own route, not the status one'
      );
    });

    it('answers 404 for an appointment that does not exist', async () => {
      assert.equal((await patch('/appointments/999999/cancel', admin.token)).status, 404);
    });
  });
});
