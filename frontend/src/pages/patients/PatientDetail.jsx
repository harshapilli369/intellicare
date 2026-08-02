import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';

import AppointmentNotes from '../../components/notes/AppointmentNotes';
import PrescribeDialog from '../../components/prescriptions/PrescribeDialog';
import EditPatientDialog from '../../components/patients/EditPatientDialog';
import ExportMenu from '../../components/patients/ExportMenu';
import InviteButton from '../../components/patients/InviteButton';
import PatientInfoCard from '../../components/patients/PatientInfoCard';
import PreviousAppointments from '../../components/patients/PreviousAppointments';
import { useAuth } from '../../context/AuthContext';
import { getPatient } from '../../services/patientApi';

const Section = ({ title, items, empty }) => (
  <>
    <h2 className="mt-10 text-[1.75rem] leading-tight">{title}</h2>
    {items?.length ? (
      <ul className="mt-4 list-disc space-y-1.5 pl-6 text-base text-slate-900">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    ) : (
      <p className="mt-4 text-sm text-slate-500">{empty}</p>
    )}
  </>
);

// A patient's full record: who they are, what they are taking, what they have
// been seen for, and the actions a clinician takes from here.
const PatientDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  // The appointment whose notes are open, if any.
  const [notesFor, setNotesFor] = useState(null);
  const [prescribing, setPrescribing] = useState(false);
  const [editing, setEditing] = useState(false);

  const isClinician = user?.role === 'clinician';
  const base = user?.role === 'admin' ? '/admin' : '/clinician';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getPatient(id)
      .then((res) => {
        if (!cancelled) setPatient(res);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(
          err.response?.status === 404 ? 'That patient does not exist' : 'Could not load the patient'
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) return <p className="text-sm text-slate-500">Loading patient...</p>;
  if (!patient) return <p className="text-sm text-slate-500">Patient not found.</p>;

  // The API returns visits newest first, so the most recent one is the head.
  const appointments = patient.appointments || [];
  const [lastAppointment] = appointments;
  const prescriptions = patient.prescriptions || [];

  // The summary screen is where a brief is generated and reviewed; the record
  // hands it the appointment rather than making the clinician retype an id.
  const openSummary = (appointmentId) =>
    navigate(`/clinician/ai-summaries?appointment=${appointmentId}`);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to={`${base}/patients`} className="text-sm text-brand hover:underline">
          &larr; Back to patients
        </Link>
        <div className="flex items-center gap-3">
          <ExportMenu patientId={id} canExportPdf />
          {/* Correcting demographics, and getting a patient into their own
              account, are both the administrative assistant's job. */}
          {user?.role === 'admin' && (
            <>
              <InviteButton patientId={id} />
              <button type="button" onClick={() => setEditing(true)} className="btn-outline">
                Edit details
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-8 lg:grid-cols-2">
        <div>
          <PatientInfoCard patient={patient} lastAppointment={lastAppointment} />

          <h2 className="mt-10 text-[1.75rem] leading-tight">Medications &amp; Prescriptions</h2>
          {prescriptions.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No medications on record.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {prescriptions.map((prescription) => (
                <li
                  key={prescription.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3"
                >
                  <div>
                    <p className="text-base text-slate-900">
                      {[prescription.medication, prescription.dosage].filter(Boolean).join(' ')}
                      {!prescription.current && (
                        <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                          Finished
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {[prescription.frequency, prescription.duration].filter(Boolean).join(' · ') ||
                        'No usage recorded'}
                    </p>
                  </div>
                  <Link
                    to={`/prescriptions/${prescription.id}/print`}
                    className="text-sm text-brand hover:underline"
                  >
                    Print
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {isClinician && (
            <button
              type="button"
              onClick={() => setPrescribing(true)}
              className="btn-outline mt-4"
            >
              Prescribe medication
            </button>
          )}
          <Section
            title="Medical History"
            items={patient.medicalHistory}
            empty="No history on record."
          />
          <Section title="Allergies" items={patient.allergies} empty="None recorded." />

          {isClinician && (
            <div className="mt-10 space-y-5">
              <button
                type="button"
                onClick={() => openSummary(lastAppointment.id)}
                disabled={!lastAppointment}
                title={lastAppointment ? undefined : 'This patient has no appointment yet'}
                className="btn-block-outline"
              >
                Generate Pre-Appointment Notes
              </button>
              {/* Notes attach to a visit, so this opens the most recent one. */}
              <button
                type="button"
                onClick={() => setNotesFor(lastAppointment)}
                disabled={!lastAppointment}
                title={lastAppointment ? undefined : 'This patient has no appointment yet'}
                className="btn-block-outline"
              >
                + Add New Appointment Notes
              </button>
            </div>
          )}
        </div>

        <PreviousAppointments
          appointments={appointments}
          onViewSummary={openSummary}
          onViewNotes={setNotesFor}
          canViewSummary={isClinician}
          canViewNotes={isClinician}
        />
      </div>

      {notesFor && (
        <AppointmentNotes
          appointment={notesFor}
          patientName={patient.name}
          onClose={() => setNotesFor(null)}
        />
      )}

      {editing && (
        <EditPatientDialog
          patient={patient}
          onClose={() => setEditing(false)}
          onSaved={() => getPatient(id).then(setPatient)}
        />
      )}

      {prescribing && (
        <PrescribeDialog
          patient={patient}
          appointmentId={lastAppointment?.id}
          onClose={() => setPrescribing(false)}
          // Re-read the record so the new medication appears in the list.
          onIssued={() => getPatient(id).then(setPatient)}
        />
      )}
    </div>
  );
};

export default PatientDetail;
