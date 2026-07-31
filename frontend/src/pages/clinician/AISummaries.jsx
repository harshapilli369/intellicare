import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';

import AiBadge from '../../components/ai/AiBadge';
import { getSummary, generatePre, generatePost, finalizeSummary } from '../../services/aiApi';

const AISummaries = () => {
  const [searchParams] = useSearchParams();
  const presetId = searchParams.get('appointment') || '';

  const [appointmentId, setAppointmentId] = useState(presetId);
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

  // Arriving from a patient record carries the appointment in the URL, so that
  // visit's summary opens without the clinician retyping its id.
  useEffect(() => {
    if (!presetId) return;
    setAppointmentId(presetId);
    load(presetId);
    // Only re-runs when the record hands over a different appointment.
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

      <div className="card-plain mt-6 flex items-end gap-3 rounded-2xl bg-white p-5">
        <label className="flex-1">
          <span className="text-sm font-medium text-slate-700">Appointment ID</span>
          <input
            type="number"
            value={appointmentId}
            onChange={(event) => setAppointmentId(event.target.value)}
            placeholder="e.g. 12"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
        <button type="button" onClick={() => load()} disabled={!appointmentId || busy} className="btn-primary">
          {busy === 'load' ? 'Loading...' : 'Load'}
        </button>
      </div>

      {appointmentId && (
        <>
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
