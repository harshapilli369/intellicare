import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';

import Modal from '../common/Modal';
import { bookAppointment, getAvailability } from '../../services/appointmentApi';
import { listClinicians } from '../../services/userApi';
import { listPatients } from '../../services/patientApi';

const today = () => {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
};

const formatSlot = (value) =>
  new Date(value).toLocaleTimeString('en-CA', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

// Booking on a patient's behalf: choose who, with whom, and one of the times
// the clinician actually has free that day.
const BookingDialog = ({ onClose, onBooked }) => {
  const [patients, setPatients] = useState([]);
  const [clinicians, setClinicians] = useState([]);

  const [patientId, setPatientId] = useState('');
  const [clinicianId, setClinicianId] = useState('');
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState('');
  const [slot, setSlot] = useState('');

  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([listPatients({ limit: 100 }), listClinicians()])
      .then(([directory, staff]) => {
        setPatients(directory.patients);
        setClinicians(staff);
        if (staff.length === 1) setClinicianId(String(staff[0].id));
      })
      .catch(() => toast.error('Could not load patients and clinicians'));
  }, []);

  // Free times are a property of one clinician on one day, so they are re-read
  // whenever either changes, and the chosen time is dropped with them.
  useEffect(() => {
    if (!clinicianId || !date) {
      setSlots([]);
      return undefined;
    }
    let cancelled = false;
    setLoadingSlots(true);
    setSlot('');

    getAvailability(clinicianId, date)
      .then((free) => {
        if (!cancelled) setSlots(free);
      })
      .catch(() => {
        if (!cancelled) setSlots([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clinicianId, date]);

  const submit = async () => {
    setSaving(true);
    try {
      const appointment = await bookAppointment({
        patientId: Number(patientId),
        clinicianId: Number(clinicianId),
        scheduledAt: slot,
        reason: reason.trim() || undefined,
      });
      toast.success(`Booked for ${appointment.patientName}`);
      onBooked(appointment);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not book that appointment');
    } finally {
      setSaving(false);
    }
  };

  const ready = patientId && clinicianId && slot && !saving;

  return (
    <Modal title="Book an appointment" onClose={onClose} width="max-w-2xl">
      <div className="space-y-5">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Patient</span>
          <select
            value={patientId}
            onChange={(event) => setPatientId(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          >
            <option value="">Choose a patient...</option>
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Clinician</span>
            <select
              value={clinicianId}
              onChange={(event) => setClinicianId(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            >
              <option value="">Choose a clinician...</option>
              {clinicians.map((clinician) => (
                <option key={clinician.id} value={clinician.id}>
                  {clinician.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Date</span>
            <input
              type="date"
              value={date}
              min={today()}
              onChange={(event) => setDate(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
        </div>

        <div>
          <p className="text-sm font-medium text-slate-700">Available times</p>

          {!clinicianId && <p className="mt-2 text-sm text-slate-500">Choose a clinician first.</p>}
          {clinicianId && loadingSlots && (
            <p className="mt-2 text-sm text-slate-500">Checking their diary...</p>
          )}
          {clinicianId && !loadingSlots && slots.length === 0 && (
            <p className="mt-2 text-sm text-slate-500">Nothing free that day.</p>
          )}

          {slots.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {slots.map((free) => (
                <button
                  key={free}
                  type="button"
                  onClick={() => setSlot(free)}
                  className={`rounded-md px-3 py-1.5 text-sm transition ${
                    slot === free
                      ? 'bg-brand text-white'
                      : 'bg-brand-50 text-brand hover:bg-brand-50/70'
                  }`}
                >
                  {formatSlot(free)}
                </button>
              ))}
            </div>
          )}
        </div>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Reason (optional)</span>
          <input
            type="text"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="What are they being seen for?"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-outline">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={!ready} className="btn-primary">
            {saving ? 'Booking...' : 'Book appointment'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default BookingDialog;
