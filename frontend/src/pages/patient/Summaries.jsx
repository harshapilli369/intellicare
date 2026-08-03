import { Link } from 'react-router-dom';

import AiBadge from '../../components/ai/AiBadge';
import LoadError from '../../components/common/LoadError';
import useLoad from '../../hooks/useLoad';
import { getPatientDashboard } from '../../services/dashboardApi';
import { getPatientSummaries } from '../../services/aiApi';

const formatDate = (value) =>
  new Date(value).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

// What the report is about: the visit it describes, who was seen, and what for.
// The date a summary was written is not the date of the appointment - a
// clinician may finalize weeks later - so the visit's own date leads.
const Heading = ({ appointment, writtenAt }) => {
  if (!appointment) {
    // The visit is no longer on file. Say what is known rather than nothing.
    return (
      <div>
        <p className="text-sm font-bold text-slate-900">Summary of a past visit</p>
        <p className="mt-0.5 text-xs text-slate-500">Written {formatDate(writtenAt)}</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm font-bold text-slate-900">{formatDate(appointment.scheduledAt)}</p>
      <p className="mt-0.5 text-xs text-slate-600">
        {[appointment.reason, appointment.clinicianName].filter(Boolean).join(' · ') ||
          'Appointment'}
      </p>
    </div>
  );
};

// The plain-language summaries a clinician has released. Drafts never appear
// here; the backend only returns finalized ones.
const PatientSummaries = () => {
  const { data, error, loading, reload } = useLoad(() =>
    getPatientDashboard().then(({ patientId }) => getPatientSummaries(patientId))
  );
  const summaries = data || [];

  if (loading) return <p className="text-sm text-slate-500">Loading your reports...</p>;

  return (
    <div className="max-w-3xl">
      <Link to="/patient" className="text-sm text-brand hover:underline">
        &larr; Back to dashboard
      </Link>

      <h1 className="mt-3 text-2xl font-bold text-slate-900">Appointment Reports</h1>
      <p className="mt-1 text-sm text-slate-600">
        A plain-language summary of each visit, once your clinician has reviewed it.
      </p>

      {/* An error and an empty list look identical once the toast has faded,
          and here they mean opposite things - "we could not fetch your reports"
          against "your clinician has not released one yet". */}
      {error ? (
        <div className="mt-6">
          <LoadError what="your reports" error={error} onRetry={reload} retrying={loading} />
        </div>
      ) : summaries.length === 0 ? (
        <p className="mt-8 text-sm text-slate-500">
          You have no reports yet. One appears here after a visit, once your clinician has released
          it.
        </p>
      ) : (
        <ul className="mt-6 space-y-5">
          {summaries.map((summary) => (
            <li key={summary._id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <Heading appointment={summary.appointment} writtenAt={summary.createdAt} />
                <AiBadge />
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                {summary.patientSummary || 'This report has no patient summary yet.'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default PatientSummaries;
