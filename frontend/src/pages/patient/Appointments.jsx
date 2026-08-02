import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';

import IntakeDialog from '../../components/intake/IntakeDialog';
import {
  cancelAppointment,
  getAvailability,
  listAppointments,
  rescheduleAppointment,
} from '../../services/appointmentApi';

const formatWhen = (value) =>
  new Date(value).toLocaleString('en-CA', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

const formatSlot = (value) =>
  new Date(value).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: true });

const asDate = (value) => {
  const date = new Date(value);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
};

const STATUS_STYLE = {
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-slate-200 text-slate-600',
  no_show: 'bg-amber-100 text-amber-800',
};
const STATUS_LABEL = { completed: 'Completed', cancelled: 'Cancelled', no_show: 'Missed' };

// One appointment, and the reschedule panel when it is the one being moved.
//
// Declared here rather than inside the page. A component defined during a
// render is a new type on every render, so React throws the whole subtree away
// and builds it again instead of updating it - which loses focus, closes the
// open date picker, and makes the list flash on every keystroke.
const AppointmentCard = ({
  appointment,
  actionable,
  busy,
  moving,
  movingDate,
  slots,
  onIntake,
  onStartMove,
  onCancel,
  onPickDate,
  onMoveTo,
  onStopMoving,
}) => (
  <li className="card">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-lg font-bold text-slate-900">{appointment.clinicianName}</p>
          {appointment.status !== 'scheduled' && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                STATUS_STYLE[appointment.status]
              }`}
            >
              {STATUS_LABEL[appointment.status]}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-brand">{appointment.reason || 'No reason recorded'}</p>
        <p className="mt-1 text-sm text-slate-600">{formatWhen(appointment.scheduledAt)}</p>
      </div>

      {actionable && (
        <div className="flex flex-wrap gap-3">
          {/* Telling the clinic what is wrong before arriving. */}
          <button type="button" onClick={() => onIntake(appointment)} className="btn-primary">
            Intake form
          </button>
          <button
            type="button"
            onClick={() => onStartMove(appointment)}
            disabled={busy}
            className="btn-outline"
          >
            Reschedule
          </button>
          <button
            type="button"
            onClick={() => onCancel(appointment)}
            disabled={busy}
            className="btn-outline"
          >
            Cancel
          </button>
        </div>
      )}
    </div>

    {moving && (
      <div className="mt-5 border-t border-slate-100 pt-5">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Move to</span>
          <input
            type="date"
            value={movingDate}
            onChange={(event) => onPickDate(event.target.value)}
            className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>

        {slots.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Nothing free that day.</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {slots.map((free) => (
              <button
                key={free}
                type="button"
                onClick={() => onMoveTo(free)}
                className="rounded-md bg-brand-50 px-3 py-1.5 text-sm text-brand transition hover:bg-brand-50/70"
              >
                {formatSlot(free)}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={onStopMoving}
          className="mt-4 text-sm text-slate-500 hover:underline"
        >
          Never mind
        </button>
      </div>
    )}
  </li>
);

const PatientAppointments = () => {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  // The appointment being moved, and the times free on its day.
  const [moving, setMoving] = useState(null);
  const [slots, setSlots] = useState([]);
  const [movingDate, setMovingDate] = useState('');
  // The appointment whose intake form is open, if any.
  const [intakeFor, setIntakeFor] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAppointments(await listAppointments());
    } catch {
      toast.error('Could not load your appointments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!moving || !movingDate) return undefined;
    let cancelled = false;

    getAvailability(moving.clinicianId, movingDate)
      .then((free) => {
        if (!cancelled) setSlots(free);
      })
      .catch(() => {
        if (!cancelled) setSlots([]);
      });

    return () => {
      cancelled = true;
    };
  }, [moving, movingDate]);

  const startMove = (appointment) => {
    setMoving(appointment);
    setMovingDate(asDate(appointment.scheduledAt));
    setSlots([]);
  };

  const moveTo = async (slot) => {
    setBusyId(moving.id);
    try {
      await rescheduleAppointment(moving.id, slot);
      toast.success('Appointment moved');
      setMoving(null);
      await load();
    } catch (err) {
      // A 409 here is the change window having closed, or the slot being taken.
      toast.error(err.response?.data?.message || 'Could not move that appointment');
    } finally {
      setBusyId(null);
    }
  };

  const cancel = async (appointment) => {
    setBusyId(appointment.id);
    try {
      await cancelAppointment(appointment.id);
      toast.success('Appointment cancelled');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not cancel that appointment');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <p className="text-sm text-slate-500">Loading your appointments...</p>;

  const upcoming = appointments.filter(
    (a) => a.status === 'scheduled' && new Date(a.scheduledAt).getTime() > Date.now()
  );
  const rest = appointments.filter((a) => !upcoming.includes(a));

  // The wiring every card needs. Gathered once rather than written out twice.
  const cardProps = (appointment) => ({
    appointment,
    busy: busyId === appointment.id,
    moving: moving?.id === appointment.id,
    movingDate,
    slots,
    onIntake: setIntakeFor,
    onStartMove: startMove,
    onCancel: cancel,
    onPickDate: setMovingDate,
    onMoveTo: moveTo,
    onStopMoving: () => setMoving(null),
  });

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900">My Appointments</h1>
        <Link
          to="/patient/book"
          className="rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-dark"
        >
          Book an appointment
        </Link>
      </div>

      <h2 className="mt-8 text-lg font-semibold text-slate-900">Upcoming</h2>
      {upcoming.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">You have no upcoming appointments.</p>
      ) : (
        <ul className="mt-3 space-y-4">
          {upcoming.map((appointment) => (
            <AppointmentCard key={appointment.id} {...cardProps(appointment)} actionable />
          ))}
        </ul>
      )}

      <h2 className="mt-10 text-lg font-semibold text-slate-900">Past and cancelled</h2>
      {rest.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Nothing yet.</p>
      ) : (
        <ul className="mt-3 space-y-4">
          {rest.map((appointment) => (
            <AppointmentCard key={appointment.id} {...cardProps(appointment)} actionable={false} />
          ))}
        </ul>
      )}

      {intakeFor && (
        <IntakeDialog
          appointment={intakeFor}
          onClose={() => setIntakeFor(null)}
          onSubmitted={() => {}}
        />
      )}
    </div>
  );
};

export default PatientAppointments;
