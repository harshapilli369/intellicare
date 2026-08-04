import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useAuth, homePathFor } from '../../context/AuthContext';
import { checkInvitation, acceptInvitation } from '../../services/authApi';

const MIN_LENGTH = 8;

// Where an invited patient lands. They have not got a password yet - the
// account was created for them - so this is where they choose one, and they are
// signed in straight afterwards rather than sent round to the login form.
const AcceptInvitation = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { adopt } = useAuth();

  const [invitation, setInvitation] = useState(null);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    checkInvitation(token)
      .then((found) => {
        if (!cancelled) setInvitation(found);
      })
      .catch(() => {
        if (!cancelled) setInvitation(null);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const submit = async (event) => {
    event.preventDefault();
    setError(null);

    if (password !== confirmation) {
      setError('Those two passwords are not the same');
      return;
    }

    setSubmitting(true);
    try {
      const user = await acceptInvitation(token, password);
      adopt(user);
      navigate(homePathFor(user.role));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not set that password');
      setSubmitting(false);
    }
  };

  const frame = (children) => (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-brand">IntelliCare</h1>
        {children}
      </div>
    </div>
  );

  if (checking) {
    return frame(<p className="mt-4 text-sm text-slate-500">Checking your invitation...</p>);
  }

  // Expired, already used, and never real are one answer here, because the
  // person reading it can do the same thing about all three.
  if (!invitation) {
    return frame(
      <>
        <p className="mt-4 text-sm text-slate-700">
          This invitation is no longer valid. It may have expired, or already been used.
        </p>
        <p className="mt-3 text-sm text-slate-600">
          Ask your clinic to send you a new one, or{' '}
          <Link to="/login" className="font-bold text-brand hover:underline">
            sign in
          </Link>{' '}
          if you have already set a password.
        </p>
      </>
    );
  }

  const tooShort = password.length > 0 && password.length < MIN_LENGTH;

  return frame(
    <>
      <p className="mt-1 text-sm leading-snug text-slate-600">
        Welcome, {invitation.name}. Choose a password to finish setting up your account.
      </p>
      <p className="mt-1 text-xs text-slate-500">{invitation.email}</p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="password" className="text-sm font-bold text-slate-900">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <p className={`mt-1 text-xs ${tooShort ? 'text-red-600' : 'text-slate-500'}`}>
            At least {MIN_LENGTH} characters.
          </p>
        </div>

        <div>
          <label htmlFor="confirmation" className="text-sm font-bold text-slate-900">
            Confirm password
          </label>
          <input
            id="confirmation"
            type="password"
            required
            autoComplete="new-password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting || password.length < MIN_LENGTH}
          className="btn-primary w-full py-2.5"
        >
          {submitting ? 'Setting your password...' : 'Set password and continue'}
        </button>
      </form>
    </>
  );
};

export default AcceptInvitation;
