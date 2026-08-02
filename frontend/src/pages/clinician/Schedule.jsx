import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

import AppointmentCard from '../../components/appointments/AppointmentCard';
import SearchInput from '../../components/common/SearchInput';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import { useAuth } from '../../context/AuthContext';
import { listAppointments, setAppointmentStatus } from '../../services/appointmentApi';
import { requestIntake as requestIntakeForm } from '../../services/intakeApi';

// A date as YYYY-MM-DD in local terms, which is what the API filters on.
const toDateInput = (date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');

const shiftDays = (dateString, days) => {
  const [year, month, day] = dateString.split('-').map(Number);
  const shifted = new Date(year, month - 1, day + days);
  return toDateInput(shifted);
};

const longDate = (dateString) => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const ClinicianSchedule = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [date, setDate] = useState(toDateInput(new Date()));
  const [appointments, setAppointments] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const debouncedSearch = useDebouncedValue(search, 200);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      // One clinician, one day: the filter is applied by the API so the page
      // never holds appointments it is not showing.
      setAppointments(await listAppointments({ clinicianId: user.id, from: date, to: date }));
    } catch {
      setAppointments([]);
      toast.error('Could not load your schedule');
    } finally {
      setLoading(false);
    }
  }, [user?.id, date]);

  useEffect(() => {
    load();
  }, [load]);

  const openPatient = useCallback((patientId) => navigate(`/clinician/patients/${patientId}`), [navigate]);

  const generateBrief = useCallback(
    (appointmentId) => navigate(`/clinician/ai-summaries?appointment=${appointmentId}`),
    [navigate]
  );

  // Asking a patient for their intake form. The clinic may say what it wants to
  // know, which is what the patient is shown alongside the request.
  const requestIntake = useCallback(async (appointment) => {
    const note = window.prompt(
      `What would you like ${appointment.patientName} to tell you before the visit?\n\nLeave blank for the standard request.`,
      ''
    );
    // Cancelled the prompt rather than leaving it empty.
    if (note === null) return;

    setBusyId(appointment.id);
    try {
      await requestIntakeForm(appointment.id, note.trim() || undefined);
      toast.success(`${appointment.patientName} has been asked to fill in their form`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not send that request');
    } finally {
      setBusyId(null);
    }
  }, []);

  // The card is told what happened; the list is re-read so the change shows in
  // the same shape the API reports it, rather than a guess made here.
  const changeStatus = useCallback(async (appointmentId, status) => {
    setBusyId(appointmentId);
    try {
      const updated = await setAppointmentStatus(appointmentId, status);
      setAppointments((current) =>
        current.map((item) => (item.id === appointmentId ? { ...item, status: updated.status } : item))
      );
      toast.success(status === 'completed' ? 'Marked completed' : 'Marked as a no show');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not update the appointment');
    } finally {
      setBusyId(null);
    }
  }, []);

  // The day is small enough to filter in the browser, and it keeps typing
  // instant rather than issuing a request per keystroke.
  const term = debouncedSearch.trim().toLowerCase();
  const shown = term
    ? appointments.filter((appointment) => {
        const time = new Date(appointment.scheduledAt)
          .toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true })
          .toLowerCase();
        return (
          appointment.patientName?.toLowerCase().includes(term) ||
          appointment.reason?.toLowerCase().includes(term) ||
          time.includes(term)
        );
      })
    : appointments;

  const isToday = date === toDateInput(new Date());

  return (
    <div>
      <SearchInput value={search} onChange={setSearch} placeholder="Search Patient Name or Time" />

      <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Appointments</h1>
          <p className="mt-1 text-sm text-slate-500">
            {longDate(date)}
            {isToday && ' — today'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setDate(shiftDays(date, -1))} className="btn-outline">
            Previous
          </button>
          <button type="button" onClick={() => setDate(toDateInput(new Date()))} className="btn-outline">
            Today
          </button>
          <button type="button" onClick={() => setDate(shiftDays(date, 1))} className="btn-outline">
            Next
          </button>
          <input
            type="date"
            value={date}
            onChange={(event) => event.target.value && setDate(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </div>
      </div>

      {loading && <p className="mt-8 text-sm text-slate-500">Loading your schedule...</p>}

      {!loading && shown.length === 0 && (
        <p className="mt-8 text-sm text-slate-500">
          {appointments.length === 0
            ? 'Nothing booked for this day.'
            : 'No appointments match this search.'}
        </p>
      )}

      {!loading && shown.length > 0 && (
        <ul className="mt-6 space-y-6">
          {shown.map((appointment) => (
            <AppointmentCard
              key={appointment.id}
              appointment={appointment}
              onOpenPatient={openPatient}
              onGenerateBrief={generateBrief}
              onSetStatus={changeStatus}
              onRequestIntake={requestIntake}
              busy={busyId === appointment.id}
            />
          ))}
        </ul>
      )}
    </div>
  );
};

export default ClinicianSchedule;
