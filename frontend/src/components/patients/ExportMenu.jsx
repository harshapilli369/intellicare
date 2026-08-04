import { useState } from 'react';
import { toast } from 'react-toastify';

import { exportPatient } from '../../services/patientApi';

// A small "Export" button that opens onto CSV / JSON / PDF. PDF is only
// offered to staff — the backend rejects it for a patient's own export too,
// but hiding it here means a patient never sees an option that isn't theirs.
const ExportMenu = ({ patientId, canExportPdf }) => {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const formats = canExportPdf ? ['csv', 'json', 'pdf'] : ['csv', 'json'];

  const run = async (format) => {
    setOpen(false);
    setExporting(true);
    try {
      await exportPatient(patientId, format);
    } catch (err) {
      toast.error(
        err.response?.status === 403
          ? 'That export format is not available to you'
          : 'Could not export this record'
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        disabled={exporting}
        className="btn-outline"
      >
        {exporting ? 'Exporting...' : 'Export'}
      </button>

      {open && (
        <>
          {/* Closes the menu on an outside click without a separate listener. */}
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute right-0 z-20 mt-2 w-36 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            {formats.map((format) => (
              <button
                key={format}
                type="button"
                onClick={() => run(format)}
                className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                {format.toUpperCase()}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default ExportMenu;
