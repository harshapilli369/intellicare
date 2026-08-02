import { useCallback, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'react-toastify';

import BookingDialog from '../../components/appointments/BookingDialog';
import PatientList from '../../components/patients/PatientList';
import SearchInput from '../../components/common/SearchInput';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import { useAuth } from '../../context/AuthContext';
import { listPatients } from '../../services/patientApi';

const PAGE_SIZE = 10;
const EMPTY = { patients: [], total: 0, pages: 1 };

// The patient directory, shared by clinicians and administrative assistants.
// Both roles read the same list; what they can then do with a patient differs
// on the profile screen, not here.
const PatientsList = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [search, setSearch] = useState('');
  const [sex, setSex] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  // The patient a visit is being booked for, if any.
  const [bookingFor, setBookingFor] = useState(null);

  const debouncedSearch = useDebouncedValue(search, 300);

  // A changed search or filter restarts at page one; keeping the old page would
  // ask for a page the narrower result set may no longer have.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, sex]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    listPatients({ page, limit: PAGE_SIZE, search: debouncedSearch, sex })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) {
          setData(EMPTY);
          toast.error('Could not load patients');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // A slower earlier request must not overwrite the newest results.
    return () => {
      cancelled = true;
    };
  }, [page, debouncedSearch, sex]);

  // Stable identity keeps the memoized entries from re-rendering on every keystroke.
  const base = user?.role === 'admin' ? '/admin' : '/clinician';
  const openPatient = useCallback((id) => navigate(`${base}/patients/${id}`), [navigate, base]);

  return (
    <div>
      <h1 className="sr-only">Patients</h1>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-[16rem] flex-1">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search Patient Name or Condition"
          />
        </div>
        {user?.role === 'admin' && (
          <Link to="/admin/patients/import" className="btn-outline whitespace-nowrap">
            Import Patients
          </Link>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-4">
        <p className="text-sm text-slate-500">
          {data.total === 0 ? 'No patients' : `${data.total} patient${data.total === 1 ? '' : 's'}`}
        </p>

        <label className="flex items-center gap-2 text-sm text-slate-500">
          Sex
          <select
            value={sex}
            onChange={(event) => setSex(event.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-700 outline-none focus:border-brand"
          >
            <option value="">All</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </label>
      </div>

      <div className="mt-2">
        <PatientList
          patients={data.patients}
          loading={loading}
          onView={openPatient}
          onBook={setBookingFor}
        />
      </div>

      {bookingFor && (
        <BookingDialog patient={bookingFor} onClose={() => setBookingFor(null)} onBooked={() => {}} />
      )}

      {data.pages > 1 && (
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => setPage((current) => current - 1)}
            disabled={page <= 1 || loading}
            className="btn-outline"
          >
            Previous
          </button>
          <span className="text-sm text-slate-600">
            Page {page} of {data.pages}
          </span>
          <button
            type="button"
            onClick={() => setPage((current) => current + 1)}
            disabled={page >= data.pages || loading}
            className="btn-outline"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default PatientsList;
