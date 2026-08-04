import { Link } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext';
import NotificationBell from '../notifications/NotificationBell';
import Sidebar from './Sidebar';

// The shell every signed-in screen sits inside: role navigation on the left, a
// top bar with the account and sign-out, and the page content.
const AppLayout = ({ children }) => {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1">
        <div className="flex items-center justify-end gap-4 px-8 pt-6">
          <NotificationBell />

          {/* The name in a header is conventionally the way to your own
              account, and people try it. A patient has somewhere to go, so it
              is a link; staff have no profile screen of their own, so theirs
              stays plain text rather than being a link that goes nowhere. */}
          {user?.role === 'patient' ? (
            <Link
              to="/patient/details"
              className="rounded text-sm text-slate-700 underline-offset-4 hover:text-brand hover:underline"
            >
              {user.name}
            </Link>
          ) : (
            <span className="text-sm text-slate-700">{user?.name}</span>
          )}
          <button
            type="button"
            onClick={logout}
            className="rounded-full border border-slate-200 px-4 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
        <div className="px-8 pb-10 pt-6">{children}</div>
      </main>
    </div>
  );
};

export default AppLayout;
