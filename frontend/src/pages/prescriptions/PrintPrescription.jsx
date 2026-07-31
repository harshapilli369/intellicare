import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'react-toastify';

import { getPrescription } from '../../services/prescriptionApi';

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString('en-CA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '—';

const Line = ({ label, value }) => (
  <div className="flex gap-3 border-b border-slate-200 py-3">
    <span className="w-40 text-sm font-semibold uppercase tracking-wide text-slate-500">
      {label}
    </span>
    <span className="text-base text-slate-900">{value || '—'}</span>
  </div>
);

// A single prescription on its own page, laid out to be printed. Rendered
// outside the application shell so a printed copy carries no navigation.
const PrintPrescription = () => {
  const { id } = useParams();
  const [prescription, setPrescription] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    getPrescription(id)
      .then((res) => {
        if (!cancelled) setPrescription(res);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(
          err.response?.status === 404
            ? 'That prescription does not exist'
            : 'Could not load the prescription'
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) return <p className="p-8 text-sm text-slate-500">Loading...</p>;
  if (!prescription) return <p className="p-8 text-sm text-slate-500">Prescription not found.</p>;

  return (
    <div className="mx-auto max-w-2xl bg-white p-10 print:p-0">
      {/* The controls are for the screen only; a printed sheet should not show them. */}
      <div className="mb-8 flex justify-end gap-3 print:hidden">
        <button type="button" onClick={() => window.history.back()} className="btn-outline">
          Back
        </button>
        <button type="button" onClick={() => window.print()} className="btn-primary">
          Print
        </button>
      </div>

      <h1 className="text-3xl font-bold text-brand">IntelliCare</h1>
      <p className="mt-1 text-sm text-slate-600">Prescription</p>

      <div className="mt-8">
        <Line label="Patient" value={prescription.patientName} />
        <Line label="Medication" value={prescription.medication} />
        <Line label="Dosage" value={prescription.dosage} />
        <Line label="Usage" value={prescription.frequency} />
        <Line label="Route" value={prescription.route} />
        <Line label="Duration" value={prescription.duration} />
        <Line label="Issued" value={formatDate(prescription.issuedOn)} />
        <Line label="Runs out" value={formatDate(prescription.runsOutOn)} />
      </div>

      <div className="mt-16">
        <p className="border-b border-slate-900 pb-1 text-lg">{prescription.clinicianName}</p>
        <p className="mt-2 text-sm text-slate-600">Prescribing clinician</p>
      </div>
    </div>
  );
};

export default PrintPrescription;
