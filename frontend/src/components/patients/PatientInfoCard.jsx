const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString('en-CA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

const ageFrom = (dateOfBirth) => {
  if (!dateOfBirth) return null;
  const birth = new Date(dateOfBirth);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) years -= 1;
  return years;
};

const Line = ({ label, value }) => (
  <p className="text-sm text-slate-900">
    <span className="uppercase">{label}:</span> {value ?? '—'}
  </p>
);

// The identifying header of a patient's record: who they are and when they were
// last seen.
const PatientInfoCard = ({ patient, lastAppointment }) => (
  <section className="card">
    <h2 className="text-sm font-bold uppercase tracking-wide">Patient Info Card</h2>

    <div className="mt-4 flex flex-wrap justify-between gap-6">
      <div>
        <p className="text-xl">
          <span className="font-medium">Name:</span> {patient.name}
        </p>
        <div className="mt-2 space-y-0.5">
          <Line label="Sex" value={patient.sex} />
          <Line label="Age" value={ageFrom(patient.dateOfBirth)} />
          <Line label="Address" value={patient.address} />
          <Line label="Phone" value={patient.phone} />
          <Line label="Health card" value={patient.healthCardNumber} />
        </div>
      </div>

      <div className="text-base">
        <p>Last appointment:</p>
        <p className="mt-1">{formatDate(lastAppointment?.scheduledAt) || 'None recorded'}</p>
      </div>
    </div>
  </section>
);

export default PatientInfoCard;
