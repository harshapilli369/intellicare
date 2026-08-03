import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';

import ReminderSettings from '../../components/patients/ReminderSettings';
import LoadError from '../../components/common/LoadError';
import useLoad from '../../hooks/useLoad';
import { getPatientDashboard } from '../../services/dashboardApi';
import { getPatient, updateOwnContactDetails } from '../../services/patientApi';

const inputClass =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand';

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
    : '—';

// One line of what the clinic holds. At module scope, like every other
// component here - one declared inside its parent is a new type on every
// render, and React rebuilds rather than updates it.
const Held = ({ label, value }) => (
  <div className="flex justify-between gap-4 border-b border-slate-100 py-2.5 last:border-0">
    <span className="text-sm text-slate-500">{label}</span>
    <span className="text-sm text-slate-900">{value || '—'}</span>
  </div>
);

// What the clinic holds about a patient, and the parts of it they may put right
// themselves. Everything a patient is identified by at reception - their name,
// birth date and health card number - is shown but not editable: correcting
// those is a conversation at the desk, not a form.
const PersonalInformation = () => {
  const [patient, setPatient] = useState(null);
  const [saving, setSaving] = useState(false);

  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  const {
    data: loaded,
    error,
    loading,
    reload,
  } = useLoad(() => getPatientDashboard().then(({ patientId }) => getPatient(patientId)));

  // The form fields start from what was loaded, then belong to the person
  // typing. Seeded once rather than on every render, so a reload does not
  // discard an edit in progress.
  useEffect(() => {
    if (!loaded) return;
    setPatient(loaded);
    setPhone(loaded.phone || '');
    setAddress(loaded.address || '');
  }, [loaded]);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const saved = await updateOwnContactDetails(patient.id, { phone, address });
      setPatient(saved);
      toast.success('Your details are up to date');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save those details');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-slate-500">Loading your details...</p>;

  if (error || !patient) {
    return <LoadError what="your details" error={error} onRetry={reload} retrying={loading} />;
  }

  const unchanged = phone === (patient.phone || '') && address === (patient.address || '');

  return (
    <div className="max-w-2xl">
      <Link to="/patient" className="text-sm text-brand hover:underline">
        &larr; Back to dashboard
      </Link>

      <h1 className="mt-3 text-2xl font-bold text-slate-900">Personal Information</h1>
      <p className="mt-1 text-sm text-slate-600">
        Keep your contact details current so the clinic can reach you about your appointments.
      </p>

      <form onSubmit={save} className="card mt-6">
        <h2 className="text-lg font-bold text-slate-900">How we reach you</h2>

        <label className="mt-4 block">
          <span className="text-sm font-medium text-slate-700">Phone</span>
          <input
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="902 555 0147"
            className={inputClass}
          />
        </label>

        <label className="mt-4 block">
          <span className="text-sm font-medium text-slate-700">Address</span>
          <input
            type="text"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="17 Barrington Street, Halifax"
            className={inputClass}
          />
        </label>

        <div className="mt-6 flex justify-end">
          <button type="submit" disabled={saving || unchanged} className="btn-primary">
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </form>

      <ReminderSettings />

      <section className="card mt-6">
        <h2 className="text-lg font-bold text-slate-900">What the clinic holds</h2>
        <p className="mt-1 text-sm text-slate-500">
          These identify you at reception. If any of it is wrong, tell the clinic and they will put
          it right.
        </p>

        <div className="mt-4">
          <Held label="Name" value={patient.name} />
          <Held label="Email" value={patient.email} />
          <Held label="Date of birth" value={formatDate(patient.dateOfBirth)} />
          <Held label="Sex" value={patient.sex} />
          <Held label="Health card number" value={patient.healthCardNumber} />
        </div>
      </section>
    </div>
  );
};

export default PersonalInformation;
