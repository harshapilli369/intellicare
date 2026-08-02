import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';

import { getPatientById, updatePatient } from '../../services/patientApi';

const inputClass =
  'w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-brand';

const Row = ({ label, htmlFor, error, children }) => (
  <div className="flex flex-wrap items-start gap-4">
    <label htmlFor={htmlFor} className="w-56 pt-3 text-sm text-slate-800">
      {label}
    </label>
    <div className="min-w-[16rem] flex-1">
      {children}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  </div>
);

const EditPatient = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    phone: '',
    sex: '',
    dateOfBirth: '',
    address: '',
    healthCardNumber: '',
    medicalHistory: [],
    allergies: [],
  });

  const [invalid, setInvalid] = useState([]);
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const set = (field) => (event) =>
    setForm({ ...form, [field]: event.target.value });

  // Load existing patient
  useEffect(() => {
    const load = async () => {
      try {
        const data = await getPatientById(id);
        setForm({
          name: data.name || '',
          phone: data.phone || '',
          sex: data.sex || '',
          dateOfBirth: data.dateOfBirth || '',
          address: data.address || '',
          healthCardNumber: data.healthCardNumber || '',
          medicalHistory: data.medicalHistory || [],
          allergies: data.allergies || [],
        });
      } catch (err) {
        setMessage('Could not load patient');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id]);

  const submit = async (event) => {
    event.preventDefault();
    setInvalid([]);
    setMessage(null);
    setSaving(true);

    try {
      const updated = await updatePatient(id, {
        ...form,
        sex: form.sex || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
      });

      toast.success(`${updated.name} updated`);
      navigate(`/admin/patients/${id}`);
    } catch (err) {
      setInvalid(err.response?.data?.fields || []);
      setMessage(err.response?.data?.message || 'Could not update patient');
    } finally {
      setSaving(false);
    }
  };

  const errorFor = (field) =>
    invalid.includes(field) ? 'Please check this field' : null;

  if (loading) {
    return <p className="text-center text-slate-600">Loading patient...</p>;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <form onSubmit={submit} className="rounded-2xl border border-slate-300 bg-white p-8">
        <div className="space-y-6">
          <div>
            <label htmlFor="name" className="text-sm font-bold text-slate-900">
              Patient Name
            </label>
            <input
              id="name"
              value={form.name}
              onChange={set('name')}
              required
              className={`mt-2 ${inputClass}`}
            />
            {errorFor('name') && (
              <p className="mt-1 text-sm text-red-600">{errorFor('name')}</p>
            )}
          </div>

          <Row label="Patient Sex" htmlFor="sex" error={errorFor('sex')}>
            <select id="sex" value={form.sex} onChange={set('sex')} className={inputClass}>
              <option value="">Not recorded</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </Row>

          <Row label="Patient Date of Birth" htmlFor="dateOfBirth" error={errorFor('dateOfBirth')}>
            <input
              id="dateOfBirth"
              type="date"
              value={form.dateOfBirth}
              onChange={set('dateOfBirth')}
              className={inputClass}
            />
          </Row>

          <p className="pt-2 text-sm font-bold text-slate-900">Patient Contact Information</p>

          <Row label="Phone Number" htmlFor="phone" error={errorFor('phone')}>
            <input
              id="phone"
              value={form.phone}
              onChange={set('phone')}
              className={inputClass}
            />
          </Row>

          <Row label="Home Address" htmlFor="address" error={errorFor('address')}>
            <input
              id="address"
              value={form.address}
              onChange={set('address')}
              className={inputClass}
            />
          </Row>

          <Row
            label="Health Card Number"
            htmlFor="healthCardNumber"
            error={errorFor('healthCardNumber')}
          >
            <input
              id="healthCardNumber"
              value={form.healthCardNumber}
              onChange={set('healthCardNumber')}
              className={inputClass}
            />
          </Row>
        </div>

        {message && (
          <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{message}</p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="mt-8 w-full rounded-lg border-2 border-brand px-6 py-3.5 text-base font-bold text-brand transition hover:bg-brand-50 disabled:opacity-40"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
};

export default EditPatient;
