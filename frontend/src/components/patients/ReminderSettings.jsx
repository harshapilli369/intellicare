import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';

import { getReminderPreferences, setReminderPreferences } from '../../services/patientApi';

// The times worth offering. A patient can want a week's warning or an hour's;
// anything finer than that is a setting nobody uses.
const CHOICES = [
  { hours: 168, label: 'A week before' },
  { hours: 72, label: 'Three days before' },
  { hours: 48, label: 'Two days before' },
  { hours: 24, label: 'The day before' },
  { hours: 2, label: 'Two hours before' },
  { hours: 1, label: 'An hour before' },
];

const describe = (hours) => {
  const known = CHOICES.find((choice) => choice.hours === hours);
  if (known) return known.label;
  return hours >= 24 ? `${Math.round(hours / 24)} days before` : `${hours} hours before`;
};

// When and how a patient wants to hear about their appointments. Until they
// choose, the clinic's own schedule applies and the screen says so, rather than
// showing an empty form that looks like nothing is set up.
const ReminderSettings = () => {
  const [preferences, setPreferences] = useState(null);
  const [chosen, setChosen] = useState([]);
  const [email, setEmail] = useState(true);
  const [inApp, setInApp] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getReminderPreferences()
      .then((found) => {
        if (cancelled) return;
        setPreferences(found);
        setChosen(found.offsetsHours);
        setEmail(found.email);
        setInApp(found.inApp);
      })
      .catch(() => {
        if (!cancelled) toast.error('Could not load your reminder settings');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (hours) =>
    setChosen((current) =>
      current.includes(hours) ? current.filter((h) => h !== hours) : [...current, hours]
    );

  const save = async () => {
    setSaving(true);
    try {
      const saved = await setReminderPreferences({ offsetsHours: chosen, email, inApp });
      setPreferences(saved);
      setChosen(saved.offsetsHours);

      toast.success(
        saved.offsetsHours.length === 0
          ? 'Reminders turned off'
          : 'Your reminder settings are saved'
      );
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save those settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;
  if (!preferences) return null;

  // Anything the clinic offers, plus anything already chosen that it does not -
  // a preference set before the list changed must still be visible and
  // removable rather than silently dropped on the next save.
  const offered = [
    ...CHOICES,
    ...chosen
      .filter((hours) => !CHOICES.some((choice) => choice.hours === hours))
      .map((hours) => ({ hours, label: describe(hours) })),
  ].sort((a, b) => b.hours - a.hours);

  const nothingChosen = chosen.length === 0;

  return (
    <section className="card mt-6">
      <h2 className="text-lg font-bold text-slate-900">Appointment reminders</h2>

      {preferences.usingClinicDefault ? (
        <p className="mt-1 text-sm text-slate-500">
          You are on the clinic&apos;s usual schedule &mdash;{' '}
          {preferences.clinicDefault.map(describe).join(' and ').toLowerCase()}. Change anything
          below to set your own.
        </p>
      ) : (
        <p className="mt-1 text-sm text-slate-500">These are your own settings.</p>
      )}

      <div className="mt-4 space-y-2">
        {offered.map((choice) => (
          <label key={choice.hours} className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={chosen.includes(choice.hours)}
              onChange={() => toggle(choice.hours)}
              className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
            />
            <span className="text-sm text-slate-800">{choice.label}</span>
          </label>
        ))}
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <p className="text-sm font-medium text-slate-700">How to reach you</p>
        <div className="mt-2 space-y-2">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={inApp}
              onChange={(event) => setInApp(event.target.checked)}
              disabled={nothingChosen}
              className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
            />
            <span className="text-sm text-slate-800">In the app</span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={email}
              onChange={(event) => setEmail(event.target.checked)}
              disabled={nothingChosen}
              className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
            />
            <span className="text-sm text-slate-800">By email</span>
          </label>
        </div>
      </div>

      {nothingChosen && (
        <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          With nothing ticked you will not be reminded about your appointments at all.
        </p>
      )}

      <div className="mt-5 flex justify-end">
        <button type="button" onClick={save} disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : 'Save reminder settings'}
        </button>
      </div>
    </section>
  );
};

export default ReminderSettings;
