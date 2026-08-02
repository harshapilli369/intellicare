import { memo } from 'react';

const formatTime = (value) =>
  new Date(value).toLocaleTimeString('en-CA', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

// How a visit that is no longer simply "scheduled" is called out on the card.
const STATUS_STYLE = {
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-slate-200 text-slate-600',
  no_show: 'bg-amber-100 text-amber-800',
};

const STATUS_LABEL = {
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No show',
};

// One slot in the day. Memoized so filtering the list by name or time only
// re-renders the cards that actually changed.
const AppointmentCard = memo(({
  appointment,
  onOpenPatient,
  onGenerateBrief,
  onSetStatus,
  onRequestIntake,
  busy,
}) => {
  const { status } = appointment;
  const isOpen = status === 'scheduled';

  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <span className="min-w-[8rem] rounded-lg bg-brand-50 px-6 py-4 text-center text-base font-bold text-brand">
          {formatTime(appointment.scheduledAt)}
        </span>

        <div className="min-w-[9rem] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900">{appointment.patientName}</h2>
            {!isOpen && (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
                {STATUS_LABEL[status]}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600">{appointment.reason || 'No reason recorded'}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onOpenPatient(appointment.patientId)}
            className="btn-solid min-w-0 px-6"
          >
            view info
          </button>
          <button
            type="button"
            onClick={() => onGenerateBrief(appointment.id)}
            className="rounded-lg border-2 border-brand px-6 py-2.5 text-sm font-bold text-brand transition hover:bg-brand-50"
          >
            Generate Pre-Appointment Notes
          </button>
        </div>
      </div>

      {/* Recording how the visit went is only meaningful while it is still open. */}
      {isOpen && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
          {/* Asking for what the patient can tell the clinic before arriving,
              which is also what the pre-appointment brief reads from. */}
          <button
            type="button"
            onClick={() => onRequestIntake(appointment)}
            disabled={busy}
            className="btn-chip w-auto px-3 disabled:opacity-50"
          >
            Request intake form
          </button>
          <span className="ml-2 text-xs text-slate-500">Mark this visit</span>
          <button
            type="button"
            onClick={() => onSetStatus(appointment.id, 'completed')}
            disabled={busy}
            className="btn-chip w-auto px-3 disabled:opacity-50"
          >
            Completed
          </button>
          <button
            type="button"
            onClick={() => onSetStatus(appointment.id, 'no_show')}
            disabled={busy}
            className="btn-chip w-auto px-3 disabled:opacity-50"
          >
            No show
          </button>
        </div>
      )}
    </li>
  );
});

AppointmentCard.displayName = 'AppointmentCard';

export default AppointmentCard;
