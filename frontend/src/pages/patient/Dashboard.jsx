import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';

import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

const formatWhen = (value) =>
  value
    ? new Date(value).toLocaleString('en-CA', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

const Stat = ({ label, value }) => (
  <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
    <p className="text-sm text-slate-600">{label}</p>
    <p className="mt-1 text-2xl font-bold text-brand">{value}</p>
  </div>
);

const PatientDashboard = () => {
  const { user } = useAuth();

  const [appointments, setAppointments] = useState([]);
  const [summaries, setSummaries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // The appointment list is already scoped to the signed-in patient, and it
    // is also what tells us which patient record is theirs: the account id and
    // the patient id are not the same number.
    api
      .get('/appointments')
      .then(async ({ data }) => {
        if (cancelled) return;
        setAppointments(data.appointments);

        const patientId = data.appointments[0]?.patientId;
        if (!patientId) return;

        const { data: ai } = await api.get(`/ai/patient/${patientId}/summaries`);
        if (!cancelled) setSummaries(ai.summaries);
      })
      .catch(() => {
        if (!cancelled) toast.error('Could not load your dashboard');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const now = Date.now();
  const upcoming = appointments
    .filter((a) => a.status === 'scheduled' && new Date(a.scheduledAt).getTime() > now)
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  const past = appointments.filter((a) => a.status === 'completed');
  const [next] = upcoming;

  if (loading) return <p className="text-sm text-slate-500">Loading your dashboard...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Welcome, {user?.name || 'Patient'}</h1>
      <p className="mt-1 text-slate-600">Your health information at a glance.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Upcoming appointments" value={upcoming.length} />
        <Stat label="Past visits" value={past.length} />
        <Stat label="Summaries available" value={summaries.length} />
      </div>

      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Upcoming Appointment</h2>

        {next ? (
          <div className="mt-4">
            <p className="font-medium text-slate-800">{next.clinicianName}</p>
            <p className="text-slate-600">{next.reason || 'No reason recorded'}</p>
            <p className="text-slate-600">{formatWhen(next.scheduledAt)}</p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">You have no upcoming appointments.</p>
        )}
      </div>

      {summaries.length > 0 && (
        <div className="mt-6 rounded-lg border border-green-300 bg-green-100 p-6">
          <p className="font-medium text-green-800">
            {summaries.length} post-appointment{' '}
            {summaries.length === 1 ? 'summary is' : 'summaries are'} waiting for you.
          </p>
        </div>
      )}

      <div className="mt-8">
        <button
          type="button"
          disabled
          title="Booking arrives with the patient self-service screens"
          className="btn-solid"
        >
          Book an appointment
        </button>
      </div>
    </div>
  );
};

export default PatientDashboard;
