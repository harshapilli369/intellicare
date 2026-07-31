import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

import BookingDialog from '../../components/appointments/BookingDialog';
import SearchInput from '../../components/common/SearchInput';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import { listAppointments, setAppointmentStatus } from '../../services/appointmentApi';

const toDateInput = (date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');

const shiftDays = (dateString, days) => {
  const [year, month, day] = dateString.split('-').map(Number);
  return toDateInput(new Date(year, month - 1, day + days));
};

const longDate = (dateString) => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const formatTime = (value) =>
  new Date(value).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true });

const STATUS_STYLE = {
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-slate-200 text-slate-600',
  no_show: 'bg-amber-100 text-amber-800',
};
const STATUS_LABEL = { completed: 'Completed', cancelled: 'Cancelled', no_show: 'No show' };

// The clinic's day across every clinician, which is the administrative view
// rather than one clinician's own book.
const AdminAppointments = () => {
  const navigate = useNavigate();

  const [date, setDate] = useState(toDateInput(new Date()));
  const [appointments, setAppointments] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [booking, setBooking] = useState(false);

  const debouncedSearch = useDebouncedValue(search, 200);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAppointments(await listAppointments({ from: date, to: date }));
    } catch {
      setAppointments([]);
      toast.error("Could not load the clinic's day");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const changeStatus = async (id, status) => {
    setBusyId(id);
    try {
      const updated = await setAppointmentStatus(id, status);
      setAppointments((current) =>
        current.map((item) => (item.id === id ? { ...item, status: updated.status } : item))
      );
      toast.success(status === 'completed' ? 'Marked attended' : 'Marked as a no show');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not update the appointment');
    } finally {
      setBusyId(null);
    }
  };

  const term = debouncedSearch.trim().toLowerCase();
  const shown = term
    ? appointments.filter(
        (appointment) =>
          appointment.patientName?.toLowerCase().includes(term) ||
          appointment.clinicianName?.toLowerCase().includes(term) ||
          appointment.reason?.toLowerCase().includes(term) ||
          formatTime(appointment.scheduledAt).toLowerCase().includes(term)
      )
    : appointments;

  return (
    <div>
      <SearchInput value={search} onChange={setSearch} placeholder="Search Patient Name or Time" />

      <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Appointments</h1>
          <p className="mt-1 text-sm text-slate-500">{longDate(date)}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setDate(shiftDays(date, -1))} className="btn-outline">
            Previous
          </button>
          <button
            type="button"
            onClick={() => setDate(toDateInput(new Date()))}
            className="btn-outline"
          >
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
          <button type="button" onClick={() => setBooking(true)} className="btn-primary">
            Book for a patient
          </button>
        </div>
      </div>

      {loading && <p className="mt-8 text-sm text-slate-500">Loading the day...</p>}

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
            <li key={appointment.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
                <span className="min-w-[8rem] rounded-lg bg-brand-50 px-6 py-4 text-center text-base font-bold text-brand">
                  {formatTime(appointment.scheduledAt)}
                </span>

                <div className="min-w-[10rem] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold text-slate-900">{appointment.patientName}</h2>
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
                  <p className="mt-1 text-sm text-slate-600">
                    {appointment.reason || 'No reason recorded'} · with {appointment.clinicianName}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => navigate(`/admin/patients/${appointment.patientId}`)}
                  className="btn-solid min-w-0 px-6"
                >
                  view info
                </button>
              </div>

              {/* Confirming attendance is the administrative follow-up. */}
              {appointment.status === 'scheduled' && (
                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
                  <span className="text-xs text-slate-500">Follow up</span>
                  <button
                    type="button"
                    onClick={() => changeStatus(appointment.id, 'completed')}
                    disabled={busyId === appointment.id}
                    className="btn-chip w-auto px-3"
                  >
                    Attended
                  </button>
                  <button
                    type="button"
                    onClick={() => changeStatus(appointment.id, 'no_show')}
                    disabled={busyId === appointment.id}
                    className="btn-chip w-auto px-3"
                  >
                    No show
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {booking && <BookingDialog onClose={() => setBooking(false)} onBooked={load} />}
    </div>
  );
};

export default AdminAppointments;
