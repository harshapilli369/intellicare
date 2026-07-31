import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// Navigation shown per role. Feature links are added as those screens are built;
// for now each role has its dashboard so the shell is navigable.
const LINKS = {
  clinician: [
    { to: '/clinician', label: 'Dashboard', end: true },
    { to: '/clinician/patients', label: 'Patients' },
    { to: '/clinician/appointments', label: 'Appointments' },
    { to: '/clinician/ai-summaries', label: 'AI Summaries' },
  ],
  admin: [
    { to: '/admin', label: 'Dashboard', end: true },
    { to: '/admin/patients', label: 'Patients' },
  ],
  patient: [{ to: '/patient', label: 'Dashboard' }],
};

const roleLabel = {
  clinician: 'Physician',
  admin: 'Administrator',
  patient: 'Patient',
};

const Sidebar = () => {
  const { user } = useAuth();
  const links = LINKS[user?.role] || [];

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="px-6 pb-6 pt-7">
        <p className="text-2xl font-bold text-brand">IntelliCare</p>
        <p className="mt-1 text-xs text-slate-600">{user?.name}</p>
        <p className="text-[11px] text-slate-500">{roleLabel[user?.role]}</p>
      </div>

      <nav className="flex flex-col">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) =>
              `px-6 py-2.5 text-sm transition ${
                isActive ? 'bg-brand-50 font-semibold text-brand' : 'text-slate-800 hover:bg-slate-50'
              }`
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
