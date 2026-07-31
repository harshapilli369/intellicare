import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';

import AiBadge from '../../components/ai/AiBadge';
import { getPatientDashboard } from '../../services/dashboardApi';
import { getPatientSummaries } from '../../services/aiApi';

const formatDate = (value) =>
  new Date(value).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

// The plain-language summaries a clinician has released. Drafts never appear
// here; the backend only returns finalized ones.
const PatientSummaries = () => {
  const [summaries, setSummaries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    getPatientDashboard()
      .then(({ patientId }) => getPatientSummaries(patientId))
      .then((res) => {
        if (!cancelled) setSummaries(res);
      })
      .catch(() => {
        if (!cancelled) toast.error('Could not load your reports');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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

      {summaries.length === 0 ? (
        <p className="mt-8 text-sm text-slate-500">
          You have no reports yet. One appears here after a visit, once your clinician has released
          it.
        </p>
      ) : (
        <ul className="mt-6 space-y-5">
          {summaries.map((summary) => (
            <li key={summary._id} className="card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-slate-900">{formatDate(summary.createdAt)}</p>
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
