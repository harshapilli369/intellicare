import { memo } from 'react';

// Age at today's date, from the date of birth alone.
const ageFrom = (dateOfBirth) => {
  if (!dateOfBirth) return null;
  const birth = new Date(dateOfBirth);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) years -= 1;
  return years;
};

// One entry in the directory: who the patient is, what they are being seen for,
// and the two actions that can be taken from the list. Memoized so typing in
// the search box only re-renders the entries whose patient actually changed.
const PatientEntry = memo(({ patient, onView }) => {
  const age = ageFrom(patient.dateOfBirth);

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-6">
      <div>
        <div className="flex items-baseline gap-2">
          <h2 className="text-xl font-bold text-slate-900">{patient.name}</h2>
          {age !== null && <span className="text-xs text-slate-500">Age {age}</span>}
        </div>
        <p className="mt-1.5 text-sm text-brand">{patient.condition || 'No recorded visit'}</p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button type="button" onClick={() => onView(patient.id)} className="btn-solid">
          view info
        </button>
        <button
          type="button"
          disabled
          title="Booking arrives with the appointments API"
          className="btn-solid"
        >
          Book appointment
        </button>
      </div>
    </li>
  );
});

PatientEntry.displayName = 'PatientEntry';

const PatientList = ({ patients, loading, onView }) => {
  if (loading) return <p className="py-10 text-sm text-slate-500">Loading patients...</p>;

  if (patients.length === 0) {
    return <p className="py-10 text-sm text-slate-500">No patients match this search.</p>;
  }

  return (
    <ul className="divide-y divide-slate-100">
      {patients.map((patient) => (
        <PatientEntry key={patient.id} patient={patient} onView={onView} />
      ))}
    </ul>
  );
};

export default PatientList;
