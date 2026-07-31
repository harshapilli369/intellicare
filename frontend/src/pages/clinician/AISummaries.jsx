import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';

import AiBadge from '../../components/ai/AiBadge';
import { useAuth } from '../../context/AuthContext';
import { getSummary, generatePre, generatePost, finalizeSummary } from '../../services/aiApi';
import { getAppointment, listAppointments } from '../../services/appointmentApi';

const describe = (appointment) => {
  const when = new Date(appointment.scheduledAt).toLocaleString('en-CA', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${appointment.patientName} — ${appointment.reason || 'Appointment'} — ${when}`;
};

const AISummaries = () => {
  const [searchParams] = useSearchParams();
  const presetId = searchParams.get('appointment') || '';
  const { user } = useAuth();

  const [appointmentId, setAppointmentId] = useState(presetId);
  const [appointment, setAppointment] = useState(null);
  const [choices, setChoices] = useState([]);
  const [summary, setSummary] = useState(null);
  const [notes, setNotes] = useState('');
  const [clinicianDraft, setClinicianDraft] = useState('');
  const [patientDraft, setPatientDraft] = useState('');
  const [busy, setBusy] = useState(null); // 'load' | 'pre' | 'post' | 'finalize'

  const applySummary = (doc) => {
    setSummary(doc);
    setClinicianDraft(doc?.clinicianSummary || '');
    setPatientDraft(doc?.patientSummary || '');
  };

  const load = useCallback(
    async (id) => {
      const target = id || appointmentId;
      if (!target) return;
      setBusy('load');
      try {
        applySummary(await getSummary(target));
      } catch (err) {
        if (err.response?.status === 404) {
          applySummary(null);
          toast.info('No summary yet for this appointment. Generate one below.');
        } else {
          toast.error('Could not load the summary');
        }
      } finally {
        setBusy(null);
      }
    },
    [appointmentId]
  );

  // The clinician's own visits, so a summary can be chosen by patient and time
  // rather than by an id nobody knows.
  useEffect(() => {
    if (!user?.id) return undefined;
    let cancelled = false;

    listAppointments({ clinicianId: user.id })
      .then((res) => {
        if (!cancelled) setChoices([...res].reverse());
      })
      .catch(() => {
        if (!cancelled) toast.error('Could not load your appointments');
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Whichever visit is selected, its details are resolved so the screen can say
  // whose summary is on it. Arriving from a patient record or the schedule
  // carries the appointment in the URL and selects it here.
  useEffect(() => {
    if (!appointmentId) {
      setAppointment(null);
      return undefined;
    }
    let cancelled = false;

    getAppointment(appointmentId)
      .then((res) => {
        if (!cancelled) setAppointment(res);
      })
      .catch(() => {
        if (!cancelled) setAppointment(null);
      });

    return () => {
      cancelled = true;
    };
  }, [appointmentId]);

  useEffect(() => {
    if (!presetId) return;
    setAppointmentId(presetId);
    load(presetId);
    // Only re-runs when another screen hands over a different appointment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetId]);

  const runPre = async () => {
    setBusy('pre');
    try {
      const { cached } = await generatePre(appointmentId);
      toast.success(cached ? 'Loaded existing brief' : 'Pre-appointment brief generated');
      applySummary(await getSummary(appointmentId));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Generation failed');
    } finally {
      setBusy(null);
    }
  };

  const runPost = async () => {
    setBusy('post');
    try {
      const { cached } = await generatePost(appointmentId, notes);
      toast.success(cached ? 'Loaded existing summaries' : 'Post-appointment summaries generated');
      applySummary(await getSummary(appointmentId));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Generation failed');
    } finally {
      setBusy(null);
    }
  };

  const finalize = async () => {
    setBusy('finalize');
    try {
      const doc = await finalizeSummary(appointmentId, {
        clinicianSummary: clinicianDraft,
        patientSummary: patientDraft,
      });
      applySummary(doc);
      toast.success('Finalized. The patient-friendly summary is now visible to the patient.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not finalize');
    } finally {
      setBusy(null);
    }
  };

  const hasPost = summary?.clinicianSummary || summary?.patientSummary;

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold">AI Summaries</h1>
      <p className="mt-1 text-sm text-slate-600">
        Generate, review, and finalize appointment summaries. AI-generated text is marked; review
        and edit it before finalizing.
      </p>

      <div className="card-plain mt-6 rounded-2xl bg-white p-5">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Appointment</span>
          <select
            value={appointmentId}
            onChange={(event) => {
              setAppointmentId(event.target.value);
              setSummary(null);
              if (event.target.value) load(event.target.value);
            }}
            disabled={busy === 'load'}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
          >
            <option value="">Choose a visit...</option>
            {choices.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {describe(choice)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {appointmentId && (
        <>
          {appointment && (
            <div className="mt-6">
              <h2 className="text-xl font-bold text-slate-900">{appointment.patientName}</h2>
              <p className="mt-0.5 text-sm text-slate-600">
                {appointment.reason || 'Appointment'} —{' '}
                {new Date(appointment.scheduledAt).toLocaleString('en-CA', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </p>
            </div>
          )}

          {summary?.finalized && (
            <div className="mt-4 rounded-lg bg-green-50 px-4 py-2 text-sm text-green-800">
              This summary is finalized. The patient-friendly version is visible to the patient.
            </div>
          )}

          {/* Pre-appointment */}
          <section className="card mt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Pre-Appointment Brief</h2>
              <button type="button" onClick={runPre} disabled={busy} className="btn-outline">
                {busy === 'pre' ? 'Generating...' : 'Generate'}
              </button>
            </div>
            {summary?.preSummary ? (
              <div className="mt-3">
                <AiBadge />
                <p className="mt-2 whitespace-pre-wrap rounded-lg bg-brand-50/40 p-4 text-sm leading-relaxed">
                  {summary.preSummary}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Not generated yet.</p>
            )}
          </section>

          {/* Post-appointment */}
          <section className="card mt-6">
            <h2 className="text-lg font-semibold">Post-Appointment Summaries</h2>

            <label className="mt-3 block">
              <span className="text-sm font-medium text-slate-700">Encounter notes</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                placeholder="What was discussed, assessed, and planned during the visit."
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </label>
            <button type="button" onClick={runPost} disabled={busy} className="btn-outline mt-3">
              {busy === 'post' ? 'Generating...' : 'Generate Summaries'}
            </button>

            {hasPost && (
              <div className="mt-5 space-y-5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">Clinician summary</span>
                    <AiBadge />
                  </div>
                  <textarea
                    value={clinicianDraft}
                    onChange={(event) => setClinicianDraft(event.target.value)}
                    rows={8}
                    disabled={summary?.finalized}
                    className="mt-1 w-full rounded-md border border-slate-300 p-3 text-sm leading-relaxed outline-none focus:border-brand disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">Patient-friendly summary</span>
                    <AiBadge />
                  </div>
                  <textarea
                    value={patientDraft}
                    onChange={(event) => setPatientDraft(event.target.value)}
                    rows={6}
                    disabled={summary?.finalized}
                    className="mt-1 w-full rounded-md border border-slate-300 p-3 text-sm leading-relaxed outline-none focus:border-brand disabled:bg-slate-50"
                  />
                </div>

                {!summary?.finalized && (
                  <button type="button" onClick={finalize} disabled={busy} className="btn-primary">
                    {busy === 'finalize' ? 'Finalizing...' : 'Finalize & Release to Patient'}
                  </button>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default AISummaries;
