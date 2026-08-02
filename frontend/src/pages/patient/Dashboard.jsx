import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

import { useAuth } from '../../context/AuthContext';
import { getPatientDashboard } from '../../services/dashboardApi';
import { exportPatient } from '../../services/patientApi';

const formatTime = (value) =>
  new Date(value).toLocaleTimeString('en-CA', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

const Stat = ({ value, label }) => (
  <div>
    <p className="text-4xl font-light text-slate-900">{value}</p>
    <p className="mt-1 text-sm text-slate-700">{label}</p>
  </div>
);

const PatientDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(null);

  useEffect(() => {
    let cancelled = false;

    getPatientDashboard()
      .then((res) => {
        if (!cancelled) setData(res);
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

  const exportRecord = async (format) => {
    setExporting(format);
    try {
      await exportPatient(data.patientId, format);
    } catch {
      toast.error('Could not export your record');
    } finally {
      setExporting(null);
    }
  };

  if (loading) return <p className="text-sm text-slate-500">Loading your dashboard...</p>;
  if (!data) return null;

  const { counts, upcoming, pastVisits } = data;
  const waiting = counts.summariesAvailable;

  return (
    <div>
      <h1 className="sr-only">Your health at a glance, {user?.name}</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card-plain rounded-2xl bg-white p-6">
          <div className="grid grid-cols-2 gap-y-8">
            <Stat value={counts.bookedAppointments} label="Booked appointments" />
            <Stat value={pastVisits} label="Past visits" />
            <Stat value={counts.refillsDueSoon} label="Prescription refills due soon" />
          </div>
        </section>

        <section className="card">
          <h2 className="text-lg font-bold uppercase tracking-wide text-slate-900">
            Upcoming Appointment
          </h2>

          {upcoming ? (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
              <div>
                <p className="text-lg font-bold text-slate-900">{upcoming.clinicianName}</p>
                <p className="mt-0.5 text-sm text-brand">
                  {upcoming.reason || 'No reason recorded'}
                </p>
              </div>
              <span className="rounded bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand">
                {formatTime(upcoming.scheduledAt)}
              </span>
            </div>
          ) : (
            <p className="mt-5 text-sm text-slate-500">You have no upcoming appointments.</p>
          )}
        </section>
      </div>

      {waiting > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border-2 border-green-500 bg-white px-6 py-5">
          <p className="text-lg font-bold text-slate-900">
            {waiting === 1
              ? 'One post-appointment summary is waiting for you!'
              : `${waiting} post-appointment summaries are waiting for you!`}
          </p>
          <button
            type="button"
            onClick={() => navigate('/patient/summaries')}
            className="rounded-md bg-green-100 px-8 py-3 text-base font-bold text-slate-900 transition hover:bg-green-200"
          >
            View Report
          </button>
        </div>
      )}

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => navigate('/patient/summaries')}
          className="rounded-md bg-brand px-6 py-4 text-base font-bold text-white transition hover:bg-brand-dark"
        >
          View all Appointment Reports
        </button>
        <button
          type="button"
          onClick={() => navigate('/patient/book')}
          className="rounded-md bg-brand px-6 py-4 text-base font-bold text-white transition hover:bg-brand-dark"
        >
          Book an Appointment
        </button>
      </div>

      <section className="card mt-6">
        <h2 className="text-lg font-bold uppercase tracking-wide text-slate-900">
          Export my record
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Download your demographics, appointments, prescriptions, and visit summaries.
        </p>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => exportRecord('csv')}
            disabled={exporting !== null}
            className="btn-outline"
          >
            {exporting === 'csv' ? 'Exporting...' : 'Download CSV'}
          </button>
          <button
            type="button"
            onClick={() => exportRecord('json')}
            disabled={exporting !== null}
            className="btn-outline"
          >
            {exporting === 'json' ? 'Exporting...' : 'Download JSON'}
          </button>
        </div>
      </section>
    </div>
  );
};

export default PatientDashboard;
