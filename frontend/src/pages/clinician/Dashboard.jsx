import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

import AppointmentRow from '../../components/dashboard/AppointmentRow';
import MiniCalendar from '../../components/dashboard/MiniCalendar';
import { getClinicianDashboard } from '../../services/dashboardApi';

const Stat = ({ value, label }) => (
  <div>
    <p className="text-4xl font-light text-slate-900">{value}</p>
    <p className="mt-1 text-sm text-slate-700">{label}</p>
  </div>
);

const ClinicianDashboard = () => {
  const navigate = useNavigate();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getClinicianDashboard(`${year}-${String(month).padStart(2, '0')}`)
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
  }, [year, month]);

  const openPatient = useCallback(
    (patientId) => navigate(`/clinician/patients/${patientId}`),
    [navigate]
  );

  const shiftMonth = (by) => {
    const shifted = new Date(year, month - 1 + by, 1);
    setYear(shifted.getFullYear());
    setMonth(shifted.getMonth() + 1);
  };

  if (loading && !data) return <p className="text-sm text-slate-500">Loading your dashboard...</p>;
  if (!data) return null;

  const { counts, today, upcoming, busyDays } = data;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <section className="card-plain rounded-2xl bg-white p-6">
          <div className="grid grid-cols-2 gap-y-8">
            <Stat value={counts.appointmentsToday} label="Appointments" />
            <Stat value={counts.writeupsToApprove} label="Writeups to Approve" />
            <Stat value={counts.pendingReports} label="Pending Reports" />
          </div>
        </section>

        <section className="card">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-slate-900">Patient List</h2>
            <span className="text-sm text-slate-500">Today</span>
          </div>

          {today.length === 0 ? (
            <p className="mt-6 text-sm text-slate-500">Nothing booked for today.</p>
          ) : (
            <ul className="mt-6 space-y-6">
              {today.map((appointment) => (
                <li key={appointment.id}>
                  <AppointmentRow appointment={appointment} onOpen={openPatient} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="space-y-6">
        <section className="card">
          <h2 className="text-lg font-bold uppercase tracking-wide text-slate-900">
            Upcoming Appointment
          </h2>

          {upcoming ? (
            <div className="mt-5">
              <AppointmentRow appointment={upcoming} onOpen={openPatient} />
            </div>
          ) : (
            <p className="mt-5 text-sm text-slate-500">Nothing scheduled ahead.</p>
          )}
        </section>

        <MiniCalendar
          year={year}
          month={month}
          busyDays={busyDays}
          onPrevious={() => shiftMonth(-1)}
          onNext={() => shiftMonth(1)}
        />
      </div>
    </div>
  );
};

export default ClinicianDashboard;
