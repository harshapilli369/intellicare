const formatTime = (value) =>
  new Date(value).toLocaleTimeString('en-CA', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

// One line of the patient list, and of the upcoming appointment card: who,
// what for, when, and the way in.
const AppointmentRow = ({ appointment, onOpen }) => (
  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
    <div className="min-w-[8rem]">
      <p className="text-lg font-bold text-slate-900">{appointment.patientName}</p>
      <p className="mt-0.5 text-sm text-brand">{appointment.reason || 'No reason recorded'}</p>
    </div>

    <div className="flex items-center gap-3">
      <span className="rounded bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand">
        {formatTime(appointment.scheduledAt)}
      </span>
      <button
        type="button"
        onClick={() => onOpen(appointment.patientId)}
        className="rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-white transition hover:bg-brand-dark"
      >
        view info
      </button>
    </div>
  </div>
);

export default AppointmentRow;
