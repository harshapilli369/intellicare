import { useState } from 'react';
import { toast } from 'react-toastify';

import { invitePatient } from '../../services/patientApi';

// Sends a patient a fresh invitation to set their password. This is what a
// patient imported in bulk needs, and what anyone who has lost or never
// received their link needs - which is why an import report is not something
// anybody has to keep.
//
// The button is deliberately not called "Email invitation". Whether an email
// actually goes out depends on whether a mail provider is configured, and
// promising one in the label would make a correctly-working button look broken
// every time it is not.
const InviteButton = ({ patientId }) => {
  const [sending, setSending] = useState(false);
  const [issued, setIssued] = useState(null);
  const [copied, setCopied] = useState(false);

  const send = async () => {
    setSending(true);
    setCopied(false);
    try {
      const invitation = await invitePatient(patientId);
      setIssued(invitation);

      if (invitation.delivery === 'sent') {
        toast.success('Invitation emailed to the patient');
      }
      // When it was not emailed the outcome is shown below and stays there. A
      // toast would say it once and vanish, and what is left behind looks like
      // a button that did nothing - which is how this got reported as a bug.
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not send that invitation');
    } finally {
      setSending(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(issued.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Refused permission, or an insecure origin. The link is on screen to be
      // selected by hand, so there is nothing to report.
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <button type="button" onClick={send} disabled={sending} className="btn-outline">
        {sending ? 'Sending...' : 'Send invitation'}
      </button>

      {issued && issued.delivery === 'sent' && (
        <p className="text-xs text-green-700">Emailed to the patient.</p>
      )}

      {/* Says plainly that no email went, why, and what to do instead. Any
          earlier link has stopped working by now, so this is the only one that
          opens. */}
      {issued && issued.delivery !== 'sent' && (
        <div className="w-full max-w-sm rounded-lg border border-amber-300 bg-amber-50 p-3 text-left">
          <p className="text-xs font-medium text-amber-900">
            No email was sent &mdash; the server has no mail provider configured.
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Send this link to the patient yourself. It works once and expires
            {issued.expiresAt
              ? ` on ${new Date(issued.expiresAt).toLocaleDateString('en-CA', {
                  month: 'long',
                  day: 'numeric',
                })}`
              : ' in seven days'}
            .
          </p>

          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1 text-xs text-slate-700">
              {issued.link}
            </code>
            <button
              type="button"
              onClick={copy}
              className="shrink-0 rounded border border-amber-400 px-2 py-1 text-xs text-amber-900 hover:bg-amber-100"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default InviteButton;
