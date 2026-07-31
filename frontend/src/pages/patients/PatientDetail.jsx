import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';

import AppointmentNotes from '../../components/notes/AppointmentNotes';
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
  const medications = (patient.prescriptions || []).map((prescription) =>
    [prescription.medication, prescription.dosage].filter(Boolean).join(' ')
  );

  // The summary screen is where a brief is generated and reviewed; the record
  // hands it the appointment rather than making the clinician retype an id.
  const openSummary = (appointmentId) =>
    navigate(`/clinician/ai-summaries?appointment=${appointmentId}`);

  return (
    <div>
      <Link to={`${base}/patients`} className="text-sm text-brand hover:underline">
        &larr; Back to patients
      </Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-2">
        <div>
          <PatientInfoCard patient={patient} lastAppointment={lastAppointment} />

          <Section
            title="Medications & Prescriptions"
            items={medications}
            empty="No medications on record."
          />
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
    </div>
  );
};

export default PatientDetail;
