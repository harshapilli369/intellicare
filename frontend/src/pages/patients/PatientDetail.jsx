import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';

import { useAuth } from '../../context/AuthContext';
import { getPatient } from '../../services/patientApi';

const DASH = '—';

const Field = ({ label, value }) => (
  <div>
    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
    <dd className="mt-1 text-sm text-slate-900">{value || DASH}</dd>
  </div>
);

const TagList = ({ items }) =>
  items?.length ? (
    <div className="mt-2 flex flex-wrap gap-2">
      {items.map((item) => (
        <span key={item} className="rounded-full bg-brand-50 px-3 py-1 text-xs text-brand">
          {item}
        </span>
      ))}
    </div>
  ) : (
    <p className="mt-2 text-sm text-slate-500">None recorded.</p>
  );

// A patient's record. The demographic half lands here; medications, visit
// history, and the note and summary actions are added on top of this screen.
const PatientDetail = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);

  const base = user?.role === 'admin' ? '/admin' : '/clinician';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getPatient(id)
      .then((res) => {
        if (!cancelled) setPatient(res);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(
          err.response?.status === 404 ? 'That patient does not exist' : 'Could not load the patient'
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) return <p className="text-sm text-slate-500">Loading patient...</p>;
  if (!patient) return <p className="text-sm text-slate-500">Patient not found.</p>;

  return (
    <div className="max-w-4xl">
      <Link to={`${base}/patients`} className="text-sm text-brand hover:underline">
        &larr; Back to patients
      </Link>

      <h1 className="mt-3 text-2xl font-bold">{patient.name}</h1>
      <p className="mt-1 text-sm text-slate-600">{patient.email}</p>

      <section className="card mt-6">
        <h2 className="text-lg font-semibold">Demographics</h2>
        <dl className="mt-4 grid grid-cols-2 gap-5 sm:grid-cols-3">
          <Field label="Date of birth" value={patient.dateOfBirth} />
          <Field label="Sex" value={patient.sex} />
          <Field label="Phone" value={patient.phone} />
          <Field label="Address" value={patient.address} />
        </dl>
      </section>

      <section className="card mt-6">
        <h2 className="text-lg font-semibold">Medical history</h2>
        <TagList items={patient.medicalHistory} />

        <h2 className="mt-6 text-lg font-semibold">Allergies</h2>
        <TagList items={patient.allergies} />
      </section>
    </div>
  );
};

export default PatientDetail;
