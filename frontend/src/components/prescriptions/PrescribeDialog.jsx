import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';

import Modal from '../common/Modal';
import { useAuth } from '../../context/AuthContext';
import { createPrescription, getFormulary } from '../../services/prescriptionApi';

const Field = ({ label, children }) => (
  <label className="flex flex-wrap items-center gap-4">
    <span className="w-44 text-xl font-bold text-slate-900">{label}</span>
    <span className="min-w-[16rem] flex-1">{children}</span>
  </label>
);

const inputClass =
  'w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-brand';

// Writing a prescription. The medication comes from the reference list rather
// than being typed, which is what the backend validates against anyway.
const PrescribeDialog = ({ patient, appointmentId = null, onClose, onIssued }) => {
  const { user } = useAuth();

  const [medications, setMedications] = useState([]);
  const [medication, setMedication] = useState('');
  const [dosage, setDosage] = useState('');
  const [usage, setUsage] = useState('');
  const [duration, setDuration] = useState('');
  const [signature, setSignature] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getFormulary()
      .then(setMedications)
      .catch(() => toast.error('Could not load the medication list'));
  }, []);

  const chosen = medications.find((item) => item.name === medication);

  const submit = async () => {
    setSaving(true);
    try {
      const prescription = await createPrescription({
        patientId: patient.id,
        appointmentId: appointmentId || undefined,
        medication,
        dosage: dosage.trim() || undefined,
        frequency: usage.trim() || undefined,
        route: chosen?.routes?.[0],
        duration: duration.trim() || undefined,
      });
      toast.success(`${prescription.medication} added to ${patient.name}'s medication list`);
      onIssued(prescription);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not issue that prescription');
    } finally {
      setSaving(false);
    }
  };

  // The signature stands in for confirming the order: the clinician types their
  // own name, and it has to match the account issuing it.
  const signed = signature.trim().toLowerCase() === (user?.name || '').toLowerCase();
  const ready = medication && signed && !saving;

  return (
    <Modal title={`Prescribe for ${patient.name}`} onClose={onClose} width="max-w-3xl">
      <div className="rounded-2xl border border-slate-300 bg-white p-8">
        <div className="space-y-7">
          <Field label="Medication Name">
            <select
              value={medication}
              onChange={(event) => setMedication(event.target.value)}
              className={inputClass}
            >
              <option value="">Choose a medication...</option>
              {medications.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Dosage">
            <input
              type="text"
              value={dosage}
              onChange={(event) => setDosage(event.target.value)}
              placeholder="e.g. 500mg"
              className={inputClass}
            />
          </Field>

          <Field label="Usage">
            <input
              type="text"
              value={usage}
              onChange={(event) => setUsage(event.target.value)}
              placeholder="e.g. three times daily"
              className={inputClass}
            />
          </Field>

          <Field label="Duration">
            <input
              type="text"
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              placeholder="e.g. 7 days"
              className={inputClass}
            />
          </Field>
        </div>

        <div className="mt-12">
          <input
            type="text"
            value={signature}
            onChange={(event) => setSignature(event.target.value)}
            placeholder={user?.name}
            aria-label="Sign to confirm the prescription order"
            className="w-full border-0 border-b border-slate-900 px-1 pb-1 text-lg outline-none focus:border-brand"
          />
          <p className="mt-2 text-sm text-slate-600">sign above to confirm prescription order</p>
        </div>

        <div className="mt-8">
          <button
            type="button"
            onClick={submit}
            disabled={!ready}
            className="rounded-lg border-2 border-brand px-6 py-3 text-base font-bold text-brand transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Sending...' : 'Send to Pharmacist'}
          </button>
          <p className="mt-2 text-xs text-slate-500">
            Adds it to the patient&rsquo;s medication list. No pharmacy system is connected.
          </p>
        </div>
      </div>
    </Modal>
  );
};

export default PrescribeDialog;
