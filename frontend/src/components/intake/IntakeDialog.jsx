import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';

import Modal from '../common/Modal';
import { getIntake, submitIntake } from '../../services/intakeApi';

const MAX_FILES = 4;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const inputClass =
  'mt-1 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-brand';

const Field = ({ label, hint, children }) => (
  <label className="block">
    <span className="text-sm font-medium text-slate-800">{label}</span>
    {hint && <span className="ml-2 text-xs text-slate-500">{hint}</span>}
    {children}
  </label>
);

// What a patient tells the clinic ahead of a visit. Submitting again replaces
// the previous answers, so the form opens with whatever was said last time.
const IntakeDialog = ({ appointment, onClose, onSubmitted }) => {
  const [form, setForm] = useState({
    mainComplaint: '',
    durationDays: '',
    severity: '',
    medicationsTaken: '',
    additionalNotes: '',
  });
  const [existing, setExisting] = useState(null);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let cancelled = false;

    getIntake(appointment.id)
      .then((intake) => {
        if (cancelled) return;
        setExisting(intake);
        setForm({
          mainComplaint: intake.mainComplaint || '',
          durationDays: intake.durationDays ?? '',
          severity: intake.severity ?? '',
          medicationsTaken: intake.medicationsTaken || '',
          additionalNotes: intake.additionalNotes || '',
        });
      })
      .catch(() => {
        // A 404 simply means they have not filled it in yet.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [appointment.id]);

  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  const chooseFiles = (event) => {
    const chosen = Array.from(event.target.files || []);
    const tooBig = chosen.find((file) => file.size > MAX_FILE_BYTES);

    if (tooBig) {
      setMessage(`${tooBig.name} is larger than 5MB`);
      return;
    }
    if (chosen.length > MAX_FILES) {
      setMessage(`You can attach up to ${MAX_FILES} files`);
      return;
    }
    setMessage(null);
    setFiles(chosen);
  };

  const submit = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const intake = await submitIntake(appointment.id, form, files);
      toast.success('Thank you — your clinician will see this before your visit');
      onSubmitted(intake);
      onClose();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Could not submit that form');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Before your appointment" onClose={onClose} width="max-w-2xl">
      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : (
        <div className="space-y-5">
          <p className="-mt-2 text-sm text-slate-600">
            {appointment.clinicianName} —{' '}
            {new Date(appointment.scheduledAt).toLocaleString('en-CA', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </p>

          <Field label="What is troubling you?">
            <textarea
              value={form.mainComplaint}
              onChange={set('mainComplaint')}
              rows={4}
              required
              placeholder="Describe the main problem in your own words."
              className={inputClass}
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="How long has it been going on?" hint="days">
              <input
                type="number"
                min="0"
                value={form.durationDays}
                onChange={set('durationDays')}
                className={inputClass}
              />
            </Field>

            <Field label="How bad is it?" hint="1 to 10">
              <input
                type="number"
                min="1"
                max="10"
                value={form.severity}
                onChange={set('severity')}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Anything you have taken for it?">
            <input
              type="text"
              value={form.medicationsTaken}
              onChange={set('medicationsTaken')}
              placeholder="Medications, remedies, doses"
              className={inputClass}
            />
          </Field>

          <Field label="Anything else your clinician should know?">
            <textarea
              value={form.additionalNotes}
              onChange={set('additionalNotes')}
              rows={3}
              className={inputClass}
            />
          </Field>

          <Field label="Photographs or reports" hint="up to 4 files, 5MB each">
            <input
              type="file"
              multiple
              accept="image/*,.pdf"
              onChange={chooseFiles}
              className="mt-1 block w-full text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-brand"
            />
          </Field>

          {existing?.attachments?.length > 0 && files.length === 0 && (
            <p className="text-xs text-slate-500">
              Already attached: {existing.attachments.map((a) => a.filename).join(', ')}. Choosing
              new files replaces them.
            </p>
          )}

          {message && (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{message}</p>
          )}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-outline">
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!form.mainComplaint.trim() || saving}
              className="btn-primary"
            >
              {saving ? 'Sending...' : existing ? 'Update my answers' : 'Send to my clinician'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default IntakeDialog;
