import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

import AddPatientTabs from '../../components/patients/AddPatientTabs';
import { createPatient } from '../../services/patientApi';
import { rules, validate } from '../../utils/validation';

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

// Onboarding a patient. The account and the clinical profile are created
// together by the backend, so this collects both halves in one form.
const AddPatient = () => {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    sex: '',
    dateOfBirth: '',
    address: '',
    healthCardNumber: '',
  });
  // Problems by field name, so each input can show its own.
  const [invalid, setInvalid] = useState({});
  // Whether to invite them or set a password here. Inviting is the default
  // because it is the one that leaves no password in anybody else's hands.
  const [invite, setInvite] = useState(true);
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  // The same rules the API applies. Checked here first so an empty name or a
  // malformed address is caught while the person is still looking at the form,
  // rather than after a round trip that tells them the same thing.
  //
  // The password is only required when the administrator has chosen to set one:
  // an invited patient chooses their own, and there is nothing to validate.
  const schema = {
    name: rules.required('A name'),
    email: [rules.required('An email address'), rules.email],
    dateOfBirth: rules.pastDate,
    healthCardNumber: rules.maxLength(40, 'The health card number'),
    ...(invite ? {} : { password: [rules.required('A password'), rules.password] }),
  };

  const submit = async (event) => {
    event.preventDefault();
    setMessage(null);

    const problems = validate(form, schema);
    if (Object.keys(problems).length > 0) {
      setInvalid(problems);
      // Nothing is sent. The form says what is wrong, field by field, and the
      // first offending input is focused so a long form does not have to be
      // hunted through.
      document.getElementById(Object.keys(problems)[0])?.focus();
      return;
    }

    setInvalid({});
    setSaving(true);

    try {
      const { patient, invitation } = await createPatient({
        ...form,
        // Deliberately absent when inviting, rather than sent empty: the API
        // decides what to do from whether there is one.
        password: invite ? undefined : form.password,
        sex: form.sex || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
      });

      if (!invitation) {
        toast.success(`${patient.name} added`);
      } else if (invitation.delivery === 'sent') {
        toast.success(`${patient.name} added and emailed an invitation`);
      } else {
        // Nothing was emailed, so the link has to travel by hand - and it is on
        // the record they are about to land on, not lost with this message.
        toast.info(`${patient.name} added. No email was sent - use Send invitation on their record.`);
      }

      navigate(`/admin/patients/${patient.id}`);
    } catch (err) {
      // The server checks everything again and knows things the browser cannot -
      // that an address is already registered, say - so what it rejects is
      // marked here too rather than shown as one opaque message.
      const fields = err.response?.data?.fields || [];
      setInvalid(Object.fromEntries(fields.map((f) => [f, 'Please check this field'])));
      setMessage(err.response?.data?.message || 'Could not add that patient');
    } finally {
      setSaving(false);
    }
  };

  const errorFor = (field) => invalid[field] || null;

  return (
    <div className="mx-auto max-w-3xl">
      <AddPatientTabs />

      <form onSubmit={submit} className="rounded-2xl border border-slate-300 bg-white p-8">
        <div className="space-y-6">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Patient details
          </h2>

          <div>
            <label htmlFor="name" className="text-sm font-bold text-slate-900">
              Patient Name
            </label>
            <input
              id="name"
              value={form.name}
              onChange={set('name')}
              placeholder="Enter Patient Name"
              required
              className={`mt-2 ${inputClass}`}
            />
            {errorFor('name') && <p className="mt-1 text-sm text-red-600">{errorFor('name')}</p>}
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

          <Row label="Personal Email" htmlFor="email" error={errorFor('email')}>
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={set('email')}
              placeholder="Enter Patient Email"
              required
              className={inputClass}
            />
          </Row>

          <Row label="Phone Number" htmlFor="phone" error={errorFor('phone')}>
            <input
              id="phone"
              value={form.phone}
              onChange={set('phone')}
              placeholder="(xxx) xxx-xxxx"
              className={inputClass}
            />
          </Row>

          <Row label="Home Address" htmlFor="address" error={errorFor('address')}>
            <input
              id="address"
              value={form.address}
              onChange={set('address')}
              placeholder="xxx something street"
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
              placeholder="xxx xxx xxx xxx"
              className={inputClass}
            />
          </Row>

          {/* How the patient gets into the account created alongside this
              record. Inviting them is the default and the better answer: no
              password ever exists for somebody else to know, and there is
              nothing to relay. Setting one here is for a patient standing at
              the desk who wants it done there and then. */}
          <div className="border-t border-slate-200 pt-6">
            <p className="text-sm font-bold text-slate-900">How should they sign in?</p>

            <label className="mt-3 flex items-start gap-3">
              <input
                type="radio"
                name="access"
                checked={invite}
                onChange={() => setInvite(true)}
                className="mt-1 h-4 w-4 border-slate-300 text-brand focus:ring-brand"
              />
              <span className="text-sm text-slate-800">
                Email them an invitation to choose their own password
                <span className="block text-xs text-slate-500">
                  Recommended. The link works once and expires in seven days.
                </span>
              </span>
            </label>

            <label className="mt-3 flex items-start gap-3">
              <input
                type="radio"
                name="access"
                checked={!invite}
                onChange={() => setInvite(false)}
                className="mt-1 h-4 w-4 border-slate-300 text-brand focus:ring-brand"
              />
              <span className="text-sm text-slate-800">
                Set a password for them now
                <span className="block text-xs text-slate-500">
                  You will have to tell them what it is.
                </span>
              </span>
            </label>

            {!invite && (
              <div className="mt-4">
                <Row label="Temporary Password" htmlFor="password" error={errorFor('password')}>
                  <input
                    id="password"
                    type="password"
                    value={form.password}
                    onChange={set('password')}
                    placeholder="At least 8 characters"
                    minLength={8}
                    className={inputClass}
                  />
                </Row>
              </div>
            )}
          </div>
        </div>

        {message && (
          <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{message}</p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="mt-8 w-full rounded-lg border-2 border-brand px-6 py-3.5 text-base font-bold text-brand transition hover:bg-brand-50 disabled:opacity-40"
        >
          {saving ? 'Adding...' : '+ Add Patient'}
        </button>
      </form>
    </div>
  );
};

export default AddPatient;
