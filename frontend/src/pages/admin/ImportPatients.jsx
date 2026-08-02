import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';

import { importPatients } from '../../services/patientApi';

const ROW_LIMIT_SHOWN = 200;

// The invitation link, with a way to take a copy of it. Only shown when mail
// could not deliver it, since otherwise the patient already has it.
const InviteLink = ({ link }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Refused permission, or an insecure origin. The link is on screen to be
      // selected by hand, so there is nothing to report.
    }
  };

  return (
    <div className="mt-2 flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1 text-xs text-slate-700">
        {link}
      </code>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded border border-green-300 px-2 py-1 text-xs hover:bg-green-100"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
};

// Bulk patient onboarding from a file: pick a CSV or JSON export from another
// system, and get back exactly which rows were created and which were not,
// down to the field and the reason.
const ImportPatients = () => {
  const fileInput = useRef(null);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  const pickFile = () => fileInput.current?.click();

  const runImport = async (file) => {
    setImporting(true);
    setError(null);
    setReport(null);
    try {
      const result = await importPatients(file);
      setReport(result);
      const done = [
        result.inserted > 0 && `${result.inserted} added`,
        result.updated > 0 && `${result.updated} updated`,
      ].filter(Boolean);

      if (done.length > 0) toast.success(done.join(', '));
      if (result.rejected > 0) {
        toast.warn(`${result.rejected} row${result.rejected === 1 ? '' : 's'} could not be imported`);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not import that file');
    } finally {
      setImporting(false);
    }
  };

  const onFileChosen = (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // lets the same file be picked again after a fix
    if (!file) return;
    setFileName(file.name);
    runImport(file);
  };

  const rows = report?.results || [];
  const rejectedRows = rows.filter((r) => r.status === 'rejected');
  const insertedRows = rows.filter((r) => r.status === 'inserted');
  const updatedRows = rows.filter((r) => r.status === 'updated');

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/admin/patients" className="text-sm text-brand hover:underline">
        &larr; Back to patients
      </Link>

      <div className="mt-4 rounded-2xl border border-slate-300 bg-white p-8">
        <h1 className="text-2xl font-bold text-slate-900">Import Patients</h1>
        <p className="mt-2 text-sm text-slate-500">
          Upload a CSV or JSON file to add or update patients in bulk. A row whose email is
          already on file brings that patient up to date; columns the file leaves out are not
          touched. Each row needs at least a{' '}
          <code className="rounded bg-slate-100 px-1">name</code> and{' '}
          <code className="rounded bg-slate-100 px-1">email</code>; optional columns are{' '}
          <code className="rounded bg-slate-100 px-1">phone</code>,{' '}
          <code className="rounded bg-slate-100 px-1">dateOfBirth</code>,{' '}
          <code className="rounded bg-slate-100 px-1">sex</code>,{' '}
          <code className="rounded bg-slate-100 px-1">address</code>,{' '}
          <code className="rounded bg-slate-100 px-1">healthCardNumber</code>,{' '}
          <code className="rounded bg-slate-100 px-1">medicalHistory</code>, and{' '}
          <code className="rounded bg-slate-100 px-1">allergies</code>. A row without its own{' '}
          <code className="rounded bg-slate-100 px-1">password</code> is emailed an invitation to
          choose one. No password is created on anyone&apos;s behalf, and nothing below needs
          writing down &mdash; a patient&apos;s record will issue a fresh invitation at any time.
        </p>

        <input
          ref={fileInput}
          type="file"
          accept=".csv,.json,text/csv,application/json"
          onChange={onFileChosen}
          className="hidden"
        />

        <button
          type="button"
          onClick={pickFile}
          disabled={importing}
          className="mt-6 w-full rounded-lg border-2 border-brand px-6 py-3.5 text-base font-bold text-brand transition hover:bg-brand-50 disabled:opacity-40"
        >
          {importing ? `Importing ${fileName}...` : 'Choose a CSV or JSON file'}
        </button>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        )}

        {report && (
          <div className="mt-8">
            <div className="grid grid-cols-2 gap-4 text-center sm:grid-cols-4">
              <div className="rounded-lg bg-slate-50 py-4">
                <p className="text-2xl font-bold text-slate-900">{report.totalRows}</p>
                <p className="text-xs uppercase text-slate-500">Rows read</p>
              </div>
              <div className="rounded-lg bg-green-50 py-4">
                <p className="text-2xl font-bold text-green-700">{report.inserted}</p>
                <p className="text-xs uppercase text-green-700">Added</p>
              </div>
              <div className="rounded-lg bg-brand-50 py-4">
                <p className="text-2xl font-bold text-brand">{report.updated ?? 0}</p>
                <p className="text-xs uppercase text-brand">Updated</p>
              </div>
              <div className="rounded-lg bg-red-50 py-4">
                <p className="text-2xl font-bold text-red-700">{report.rejected}</p>
                <p className="text-xs uppercase text-red-700">Rejected</p>
              </div>
            </div>

            {rejectedRows.length > 0 && (
              <div className="mt-6">
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-900">
                  Rejected rows
                </h2>
                <ul className="mt-3 space-y-2">
                  {rejectedRows.slice(0, ROW_LIMIT_SHOWN).map((row) => (
                    <li
                      key={row.line}
                      className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm"
                    >
                      <p className="font-medium text-red-800">
                        Line {row.line}
                        {row.email ? ` — ${row.email}` : ''}
                      </p>
                      <ul className="mt-1 list-disc pl-5 text-red-700">
                        {row.errors.map((e, i) => (
                          <li key={i}>
                            {e.field ? `${e.field}: ` : ''}
                            {e.message}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
                {rejectedRows.length > ROW_LIMIT_SHOWN && (
                  <p className="mt-2 text-xs text-slate-500">
                    Showing the first {ROW_LIMIT_SHOWN} of {rejectedRows.length} rejected rows.
                  </p>
                )}
              </div>
            )}

            {updatedRows.length > 0 && (
              <div className="mt-6">
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-900">
                  Updated rows
                </h2>
                <ul className="mt-3 space-y-2">
                  {updatedRows.slice(0, ROW_LIMIT_SHOWN).map((row) => (
                    <li
                      key={row.line}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand/30 bg-brand-50/50 px-4 py-2.5 text-sm text-slate-800"
                    >
                      <span>
                        Line {row.line} — {row.email}
                      </span>
                      {/* Naming what moved is the difference between "something
                          happened" and knowing the file did what was intended. */}
                      <span className="text-xs text-slate-600">
                        {row.changed?.length ? row.changed.join(', ') : 'nothing to change'}
                      </span>
                    </li>
                  ))}
                </ul>
                {updatedRows.length > ROW_LIMIT_SHOWN && (
                  <p className="mt-2 text-xs text-slate-500">
                    Showing the first {ROW_LIMIT_SHOWN} of {updatedRows.length} updated rows.
                  </p>
                )}
              </div>
            )}

            {insertedRows.length > 0 && (
              <div className="mt-6">
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-900">
                  Added rows
                </h2>
                <ul className="mt-3 space-y-2">
                  {insertedRows.slice(0, ROW_LIMIT_SHOWN).map((row) => (
                    <li
                      key={row.line}
                      className="rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          Line {row.line} — {row.email}
                        </span>
                        {row.invitation && (
                          <span className="text-xs">
                            {row.invitation.delivery === 'sent'
                              ? 'invitation emailed'
                              : 'invitation not emailed'}
                          </span>
                        )}
                      </div>

                      {/* Shown so the link can be passed on where mail is not
                          set up. Nothing here needs writing down - the patient
                          record issues a fresh one whenever it is asked. */}
                      {row.invitation && row.invitation.delivery !== 'sent' && (
                        <InviteLink link={row.invitation.link} />
                      )}
                    </li>
                  ))}
                </ul>
                {insertedRows.length > ROW_LIMIT_SHOWN && (
                  <p className="mt-2 text-xs text-slate-500">
                    Showing the first {ROW_LIMIT_SHOWN} of {insertedRows.length} inserted rows.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ImportPatients;
