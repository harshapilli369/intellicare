import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

import PatientTable from '../../components/patients/PatientTable';
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

  // Stable identity keeps the memoized rows from re-rendering on every keystroke.
  const base = user?.role === 'admin' ? '/admin' : '/clinician';
  const openPatient = useCallback(
    (id) => navigate(`${base}/patients/${id}`),
    [navigate, base]
  );

  const from = data.total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, data.total);

  return (
    <div>
      <h1 className="text-2xl font-bold">Patients</h1>
      <p className="mt-1 text-sm text-slate-600">
        Search the directory and open a patient to see their full record.
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <label className="min-w-[16rem] flex-1">
          <span className="text-sm font-medium text-slate-700">Search</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name or email"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>

        <label>
          <span className="text-sm font-medium text-slate-700">Sex</span>
          <select
            value={sex}
            onChange={(event) => setSex(event.target.value)}
            className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
          >
            <option value="">All</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </label>
      </div>

      <p className="mt-4 text-sm text-slate-600">
        {data.total === 0 ? 'No patients' : `Showing ${from}-${to} of ${data.total}`}
      </p>

      <div className="mt-2">
        <PatientTable patients={data.patients} loading={loading} onOpen={openPatient} />
      </div>

      {data.pages > 1 && (
        <div className="mt-4 flex items-center gap-3">
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
