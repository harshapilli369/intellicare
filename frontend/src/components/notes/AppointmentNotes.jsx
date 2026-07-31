import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';

import Modal from '../common/Modal';
import { useAuth } from '../../context/AuthContext';
import { createNote, listNotesForAppointment, updateNote } from '../../services/noteApi';

// Mirrors NOTE_EDIT_WINDOW_HOURS on the server. Used only to decide whether to
// offer the Edit control; the server remains the authority and refuses a late
// edit with a 409 regardless of what is shown here.
const EDIT_WINDOW_HOURS = 24;

const formatWhen = (value) =>
  new Date(value).toLocaleString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

const withinEditWindow = (note) =>
  (Date.now() - new Date(note.createdAt).getTime()) / 3_600_000 < EDIT_WINDOW_HOURS;

const NoteCard = ({ note, canEdit, onEdit }) => (
  <li className="rounded-lg border border-slate-200 bg-white p-5">
    <p className="text-sm font-bold text-slate-900">Date: {formatWhen(note.createdAt)}</p>
    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{note.body}</p>

    {canEdit && (
      <button type="button" onClick={() => onEdit(note)} className="btn-outline mt-4">
        Edit
      </button>
    )}
  </li>
);

// The notes written during one appointment: the history, and the box for adding
// to it. Opened from a patient's record.
const AppointmentNotes = ({ appointment, patientName, onClose }) => {
  const { user } = useAuth();

  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    listNotesForAppointment(appointment.id)
      .then((res) => {
        if (!cancelled) setNotes(res);
      })
      .catch(() => {
        if (!cancelled) toast.error('Could not load the notes for this visit');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [appointment.id]);

  const startEdit = (note) => {
    setEditing(note);
    setDraft(note.body);
  };

  const cancelEdit = () => {
    setEditing(null);
    setDraft('');
  };

  const save = async () => {
    const body = draft.trim();
    if (!body) return;

    setSaving(true);
    try {
      if (editing) {
        const updated = await updateNote(editing.id, body);
        setNotes((current) => current.map((note) => (note.id === updated.id ? updated : note)));
        toast.success('Note updated');
      } else {
        const created = await createNote(appointment.id, body);
        setNotes((current) => [...current, created]);
        toast.success('Note added');
      }
      cancelEdit();
    } catch (err) {
      // A 409 here is the editing window having closed since the page loaded.
      toast.error(err.response?.data?.message || 'Could not save the note');
    } finally {
      setSaving(false);
    }
  };

  const title = editing
    ? `Edit note for ${patientName}`
    : `New Note for ${patientName}`;

  return (
    <Modal title={title} onClose={onClose}>
      <p className="-mt-4 text-sm text-slate-500">
        {appointment.reason || 'Appointment'} — {formatWhen(appointment.scheduledAt)}
      </p>

      {loading ? (
        <p className="mt-6 text-sm text-slate-500">Loading notes...</p>
      ) : (
        <>
          {notes.length > 0 && (
            <ul className="mt-6 space-y-4">
              {notes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  // A note belongs to whoever wrote it, and only stays editable
                  // for a while after it was written.
                  canEdit={note.authorId === user?.id && withinEditWindow(note) && !editing}
                  onEdit={startEdit}
                />
              ))}
            </ul>
          )}

          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={10}
            placeholder="What was discussed, assessed, and planned during this visit."
            className="mt-6 w-full rounded-lg border border-slate-200 bg-white p-5 text-sm leading-relaxed text-slate-900 outline-none focus:border-brand"
          />

          <div className="mt-4 flex justify-end gap-3">
            {editing && (
              <button type="button" onClick={cancelEdit} className="btn-outline">
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={save}
              disabled={saving || !draft.trim()}
              className="btn-outline"
            >
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create New Note'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
};

export default AppointmentNotes;
