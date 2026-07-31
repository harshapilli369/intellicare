import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, homePathFor } from '../../context/AuthContext';

const SignUp = () => {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('admin');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const user = await register({
        name: fullName,
        email,
        password,
        role,
      });
      navigate(homePathFor(user.role));
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to create account');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-[32px] border border-slate-200 bg-white p-10 shadow-2xl shadow-slate-200/50">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.32em] text-brand">Create account</p>
          <h1 className="mt-4 text-3xl font-semibold text-slate-900">Get started with IntelliCare</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Sign up to manage your care workspace, appointments, and summaries.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <label className="block text-sm font-semibold text-slate-900">
            Full name
            <input
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Jane Doe"
              required
              className="mt-3 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
            />
          </label>

          <label className="block text-sm font-semibold text-slate-900">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              className="mt-3 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
            />
          </label>

          <label className="block text-sm font-semibold text-slate-900">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Create a password"
              required
              className="mt-3 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
            />
          </label>

          <label className="block text-sm font-semibold text-slate-900">
            Confirm password
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Repeat password"
              required
              className="mt-3 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full py-3 text-sm font-semibold"
          >
            {submitting ? 'Creating account...' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default SignUp;
