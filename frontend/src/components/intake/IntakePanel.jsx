import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';

import { downloadAttachment, getIntake } from '../../services/intakeApi';

const Line = ({ label, value }) =>
  value === null || value === undefined || value === '' ? null : (
    <div className="mt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-900">{value}</p>
    </div>
  );

const readableSize = (bytes) =>
  bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;

// What the patient submitted before this visit, shown to the clinician. Absent
// rather than empty when they did not fill it in, so a blank panel is never
// mistaken for "nothing is wrong".
const IntakePanel = ({ appointmentId }) => {
  const [intake, setIntake] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getIntake(appointmentId)
      .then((res) => {
        if (!cancelled) setIntake(res);
      })
      .catch(() => {
        if (!cancelled) setIntake(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [appointmentId]);

  if (loading) return null;

  if (!intake) {
    return (
      <section className="card mt-6">
        <h2 className="text-lg font-semibold">Patient intake</h2>
        <p className="mt-2 text-sm text-slate-500">
          The patient has not filled in the pre-visit form.
        </p>
      </section>
    );
  }

  const fetchFile = async (index, filename) => {
    try {
      await downloadAttachment(appointmentId, index, filename);
    } catch {
      toast.error('Could not download that file');
    }
  };

  return (
    <section className="card mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Patient intake</h2>
        <p className="text-xs text-slate-500">
          In the patient&rsquo;s own words · submitted{' '}
          {new Date(intake.submittedAt).toLocaleDateString('en-CA', {
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </div>

      <Line label="Main complaint" value={intake.mainComplaint} />
      <Line
        label="Duration"
        value={intake.durationDays === null ? null : `${intake.durationDays} day(s)`}
      />
      <Line label="Severity" value={intake.severity === null ? null : `${intake.severity} of 10`} />
      <Line label="Already taken" value={intake.medicationsTaken} />
      <Line label="Also mentioned" value={intake.additionalNotes} />

      {intake.attachments.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Attachments</p>
          <ul className="mt-2 space-y-1">
            {intake.attachments.map((file) => (
              <li key={file.index}>
                <button
                  type="button"
                  onClick={() => fetchFile(file.index, file.filename)}
                  className="text-sm text-brand hover:underline"
                >
                  {file.filename}
                </button>
                <span className="ml-2 text-xs text-slate-500">{readableSize(file.size)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

export default IntakePanel;
