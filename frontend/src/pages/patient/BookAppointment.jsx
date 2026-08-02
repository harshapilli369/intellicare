import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

import MiniCalendar from '../../components/dashboard/MiniCalendar';
import { bookAppointment, getAvailability } from '../../services/appointmentApi';
import { listClinicians } from '../../services/userApi';

const pad = (value) => String(value).padStart(2, '0');

const formatSlot = (value) =>
  new Date(value).toLocaleTimeString('en-CA', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

const BookAppointment = () => {
  const navigate = useNavigate();
  const now = new Date();

  const [clinicians, setClinicians] = useState([]);
  const [clinicianId, setClinicianId] = useState('');

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [day, setDay] = useState(now.getDate());

  const [slots, setSlots] = useState([]);
  const [slot, setSlot] = useState('');
  const [reason, setReason] = useState('');

  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [booked, setBooked] = useState(null);

  useEffect(() => {
    listClinicians()
      .then((staff) => {
        setClinicians(staff);
        if (staff.length >= 1) setClinicianId(String(staff[0].id));
      })
      .catch(() => toast.error('Could not load the clinicians'));
  }, []);

  const date = `${year}-${pad(month)}-${pad(day)}`;

  // Free times belong to one clinician on one day, so they are re-read whenever
  // either changes and any chosen time is dropped with them.
  useEffect(() => {
    if (!clinicianId) return undefined;
    let cancelled = false;
    setLoadingSlots(true);
    setSlot('');

    getAvailability(clinicianId, date)
      .then((free) => {
        if (!cancelled) setSlots(free);
      })
      .catch(() => {
        if (!cancelled) setSlots([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clinicianId, date]);

  const shiftMonth = (by) => {
    const shifted = new Date(year, month - 1 + by, 1);
    setYear(shifted.getFullYear());
    setMonth(shifted.getMonth() + 1);
  };

  const confirm = async () => {
    setSaving(true);
    try {
      // The patient is taken from the token, so no patient is sent from here.
      const appointment = await bookAppointment({
        clinicianId: Number(clinicianId),
        scheduledAt: slot,
        reason: reason.trim() || undefined,
      });
      setBooked(appointment);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not book that appointment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative mx-auto max-w-3xl">
      <div className="flex items-center">
        <Link to="/patient" aria-label="Back" className="text-2xl text-slate-700 hover:text-brand">
          &larr;
        </Link>
        <h1 className="flex-1 text-center text-2xl font-bold text-slate-900">Book Appointment</h1>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-800 bg-white p-8">
        {clinicians.length > 1 && (
          <label className="mb-6 block">
            <span className="text-sm font-medium text-slate-700">Clinician</span>
            <select
              value={clinicianId}
              onChange={(event) => setClinicianId(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            >
              {clinicians.map((clinician) => (
                <option key={clinician.id} value={clinician.id}>
                  {clinician.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <h2 className="text-xl font-bold text-slate-900">Select Date</h2>
        <div className="mt-4">
          <MiniCalendar
            title={new Date(year, month - 1, 1).toLocaleDateString('en-CA', {
              month: 'long',
              year: 'numeric',
            })}
            year={year}
            month={month}
            selectedDay={day}
            onSelectDay={setDay}
            onPrevious={() => shiftMonth(-1)}
            onNext={() => shiftMonth(1)}
          />
        </div>

        <h2 className="mt-8 text-xl font-bold text-slate-900">Select Hour</h2>

        {/* With nobody to book with there is no day to report on, and saying
            the day is full would not be true. */}
        {!clinicianId && (
          <p className="mt-3 text-sm text-slate-500">
            No clinician is available to book with just now. Please try again shortly.
          </p>
        )}
        {clinicianId && loadingSlots && (
          <p className="mt-3 text-sm text-slate-500">Checking the diary...</p>
        )}
        {clinicianId && !loadingSlots && slots.length === 0 && (
          <p className="mt-3 text-sm text-slate-500">Nothing free that day. Try another date.</p>
        )}

        {slots.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {slots.map((free) => (
              <button
                key={free}
                type="button"
                onClick={() => setSlot(free)}
                className={`rounded-lg px-4 py-3 text-sm transition ${
                  slot === free
                    ? 'bg-slate-900 font-semibold text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {formatSlot(free)}
              </button>
            ))}
          </div>
        )}

        <label className="mt-8 block">
          <span className="text-sm font-medium text-slate-700">
            What are you being seen for? (optional)
          </span>
          <input
            type="text"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>

        <div className="mt-8 flex justify-end">
          <button
            type="button"
            onClick={confirm}
            disabled={!slot || saving}
            className="rounded-md bg-brand px-8 py-3 text-base font-bold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Booking...' : 'Confirm Appointment'}
          </button>
        </div>
      </div>

      {booked && (
        <div className="absolute inset-x-4 top-1/3 z-20 rounded-2xl bg-green-200 px-10 py-12 shadow-lg">
          <button
            type="button"
            onClick={() => navigate('/patient/appointments')}
            aria-label="Close"
            className="absolute left-5 top-4 text-xl text-slate-700 hover:text-slate-900"
          >
            &times;
          </button>
          <p className="text-center text-xl font-bold text-slate-900">
            Booking Successful! Parties will be notified
          </p>
          <p className="mt-2 text-center text-sm text-slate-700">
            {booked.clinicianName} —{' '}
            {new Date(booked.scheduledAt).toLocaleString('en-CA', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </p>
        </div>
      )}
    </div>
  );
};

export default BookAppointment;
