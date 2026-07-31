import { useState } from 'react';
import { toast } from 'react-toastify';

import Modal from '../common/Modal';
import { updatePatient } from '../../services/patientApi';

const inputClass =
  'w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-brand';

const Row = ({ label, htmlFor, error, children }) => (
  <div className="flex flex-wrap items-center gap-4">
    <label htmlFor={htmlFor} className="w-40 text-2xl text-slate-900">
      {label}
    </label>
    <div className="min-w-[14rem] flex-1">
      {children}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  </div>
);

// Correcting a patient's details. Only what is sent gets changed, so a field
// left as it was is not rewritten.
const EditPatientDialog = ({ patient, onClose, onSaved }) => {
  const [form, setForm] = useState({
    name: patient.name || '',
    address: patient.address || '',
    phone: patient.phone || '',
    dateOfBirth: patient.dateOfBirth || '',
    sex: patient.sex || '',
    healthCardNumber: patient.healthCardNumber || '',
  });
  const [invalid, setInvalid] = useState([]);
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });
  const errorFor = (field) => (invalid.includes(field) ? 'Please check this field' : null);

  const save = async () => {
    setInvalid([]);
    setMessage(null);
    setSaving(true);

    try {
      const saved = await updatePatient(patient.id, {
        ...form,
        sex: form.sex || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
      });
      toast.success('Details updated');
      onSaved(saved);
      onClose();
    } catch (err) {
      setInvalid(err.response?.data?.fields || []);
      setMessage(err.response?.data?.message || 'Could not save those changes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Edit ${patient.name}`} onClose={onClose} width="max-w-2xl">
      <div className="space-y-6">
        <Row label="Name" htmlFor="edit-name" error={errorFor('name')}>
          <input id="edit-name" value={form.name} onChange={set('name')} className={inputClass} />
        </Row>

        <Row label="Address" htmlFor="edit-address" error={errorFor('address')}>
          <input
            id="edit-address"
            value={form.address}
            onChange={set('address')}
            className={inputClass}
          />
        </Row>

        <Row label="Phone Number" htmlFor="edit-phone" error={errorFor('phone')}>
          <input id="edit-phone" value={form.phone} onChange={set('phone')} className={inputClass} />
        </Row>

        <Row label="Sex" htmlFor="edit-sex" error={errorFor('sex')}>
          <select id="edit-sex" value={form.sex} onChange={set('sex')} className={inputClass}>
            <option value="">Not recorded</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </Row>

        <Row label="Born" htmlFor="edit-dob" error={errorFor('dateOfBirth')}>
          <input
            id="edit-dob"
            type="date"
            value={form.dateOfBirth}
            onChange={set('dateOfBirth')}
            className={inputClass}
          />
        </Row>

        <Row label="Health Card" htmlFor="edit-hcn" error={errorFor('healthCardNumber')}>
          <input
            id="edit-hcn"
            value={form.healthCardNumber}
            onChange={set('healthCardNumber')}
            className={inputClass}
          />
        </Row>

        {message && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{message}</p>
        )}

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg border-2 border-brand px-8 py-3 text-base font-medium text-brand transition hover:bg-brand-50 disabled:opacity-40"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </Modal>
  );
};

export default EditPatientDialog;
