import { useState } from 'react';
import { toast } from 'react-toastify';

import { invitePatient } from '../../services/patientApi';

// Sends a patient a fresh invitation to set their password. This is what a
// patient imported in bulk needs, and what anyone who has lost or never
// received their link needs - which is why an import report is not something
// anybody has to keep.
const InviteButton = ({ patientId }) => {
  const [sending, setSending] = useState(false);
  const [issued, setIssued] = useState(null);

  const send = async () => {
    setSending(true);
    try {
      const invitation = await invitePatient(patientId);
      setIssued(invitation);

      toast.success(
        invitation.delivery === 'sent'
          ? 'Invitation emailed to the patient'
          : 'Invitation created - email is not configured, so pass the link on yourself'
      );
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not send that invitation');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={send} disabled={sending} className="btn-outline">
        {sending ? 'Sending...' : 'Send invitation'}
      </button>

      {/* Only worth showing when mail could not carry it. Any earlier link has
          stopped working by now, so this is the only one that opens. */}
      {issued && issued.delivery !== 'sent' && (
        <code className="max-w-xs truncate rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">
          {issued.link}
        </code>
      )}
    </div>
  );
};

export default InviteButton;
