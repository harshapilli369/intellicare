const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString('en-CA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

// The visit history panel beside the patient record. Each visit offers its
// notes and its post-appointment summary; the notes side stays disabled until
// the clinical notes API exists.
const PreviousAppointments = ({
  appointments,
  total = 0,
  onViewSummary,
  onViewNotes,
  canViewSummary,
  canViewNotes,
}) => (
  <section className="card h-full">
    <h2 className="inline-block border-b-2 border-brand pb-1 text-xl font-bold tracking-wide">
      PREVIOUS APPOINTMENTS
    </h2>

    {appointments.length === 0 ? (
      <p className="mt-6 text-sm text-slate-500">No appointments recorded yet.</p>
    ) : (
      <ul className="mt-6">
        {appointments.map((appointment) => (
          <li key={appointment.id} className="pt-6 first:pt-0">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
              <div className="min-w-[10rem] flex-1">
                <p className="text-base text-slate-900">{appointment.reason || 'Appointment'}</p>
                <p className="mt-1 pl-6 text-sm text-slate-600">
                  {formatDate(appointment.scheduledAt)}
                </p>
              </div>

              <div className="flex shrink-0 gap-3">
                <button
                  type="button"
                  onClick={() => onViewNotes(appointment)}
                  disabled={!canViewNotes}
                  title={canViewNotes ? undefined : 'Notes are kept by the treating clinician'}
                  className="btn-chip w-[9.5rem]"
                >
                  View Appointment Notes
                </button>
                <button
                  type="button"
                  onClick={() => onViewSummary(appointment.id)}
                  disabled={!canViewSummary}
                  title={
                    canViewSummary ? undefined : 'Summaries are reviewed by the treating clinician'
                  }
                  className="btn-chip w-[9.5rem]"
                >
                  View Post-Appointment Summary
                </button>
              </div>
            </div>

            <hr className="mt-5 border-t-2 border-brand" />
          </li>
        ))}
      </ul>
    )}

    {/* The record carries recent history rather than every visit ever, so when
        there is more the panel says so instead of quietly implying this is all
        of it. */}
    {total > appointments.length && (
      <p className="mt-6 text-sm text-slate-500">
        Showing the {appointments.length} most recent of {total} visits. The full history is in
        the exported chart.
      </p>
    )}
  </section>
);

export default PreviousAppointments;
