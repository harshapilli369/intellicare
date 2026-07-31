import { memo } from 'react';

const DASH = '—';

const formatDate = (value) => (value ? new Date(value).toLocaleDateString('en-CA') : DASH);

// Age at today's date, from the date of birth alone.
const ageFrom = (dateOfBirth) => {
  if (!dateOfBirth) return DASH;
  const birth = new Date(dateOfBirth);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) years -= 1;
  return years;
};

const Cell = ({ children, className = '' }) => (
  <td className={`px-4 py-3 text-sm ${className}`}>{children}</td>
);

// Wrapped in memo so that typing in the search box, which re-renders the page,
// only re-renders the rows whose patient actually changed. `onOpen` is memoized
// by the parent so this comparison holds.
const PatientRow = memo(({ patient, onOpen }) => {
  const open = () => onOpen(patient.id);

  return (
    <tr
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      }}
      tabIndex={0}
      className="cursor-pointer border-t border-slate-100 outline-none transition hover:bg-brand-50/40 focus:bg-brand-50/60"
    >
      <Cell className="font-medium text-slate-900">{patient.name}</Cell>
      <Cell className="text-slate-600">{patient.email}</Cell>
      <Cell className="text-slate-600">{patient.sex || DASH}</Cell>
      <Cell className="text-slate-600">{ageFrom(patient.dateOfBirth)}</Cell>
      <Cell className="text-slate-600">{formatDate(patient.dateOfBirth)}</Cell>
      <Cell className="text-slate-600">
        {patient.allergies?.length ? patient.allergies.join(', ') : DASH}
      </Cell>
      <Cell>
        <span className="font-medium text-brand">View</span>
      </Cell>
    </tr>
  );
});

PatientRow.displayName = 'PatientRow';

const HEADINGS = ['Name', 'Email', 'Sex', 'Age', 'Date of birth', 'Allergies', ''];

const PatientTable = ({ patients, loading, onOpen }) => (
  <div className="card-plain overflow-x-auto rounded-2xl bg-white">
    <table className="w-full min-w-[46rem] border-collapse">
      <thead>
        <tr className="bg-slate-50 text-left">
          {HEADINGS.map((heading) => (
            <th
              key={heading}
              scope="col"
              className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              {heading}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {patients.map((patient) => (
          <PatientRow key={patient.id} patient={patient} onOpen={onOpen} />
        ))}
      </tbody>
    </table>

    {!loading && patients.length === 0 && (
      <p className="px-4 py-10 text-center text-sm text-slate-500">
        No patients match this search.
      </p>
    )}
    {loading && <p className="px-4 py-10 text-center text-sm text-slate-500">Loading patients...</p>}
  </div>
);

export default PatientTable;
