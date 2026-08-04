import { Link, NavLink } from 'react-router-dom';

// Adding one patient and importing a file are the same job done at different
// scales, and they were on two unrelated screens - one reached from the
// sidebar, the other from a link on the directory. Somebody who found the form
// had no reason to think the other existed.
//
// They share a heading and a pair of tabs now. Still two routes, so each is
// still a place you can link to or come back to, but each shows the way to the
// other.
const TABS = [
  { to: '/admin/patients/new', label: 'One patient', hint: 'Fill in their details' },
  { to: '/admin/patients/import', label: 'From a file', hint: 'CSV or JSON, in bulk' },
];

const AddPatientTabs = () => (
  <div className="mb-6">
    <Link to="/admin/patients" className="text-sm text-brand hover:underline">
      &larr; Back to patients
    </Link>

    <h1 className="mt-4 text-2xl font-bold text-slate-900">Add patients</h1>
    <p className="mt-1 text-sm text-slate-500">
      One at a time, or a whole list from a file. Either way, nobody has a password chosen for
      them &mdash; each patient is invited to set their own.
    </p>

    <div className="mt-5 flex flex-wrap gap-3">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end
          className={({ isActive }) =>
            `flex-1 rounded-xl border-2 px-5 py-4 transition ${
              isActive
                ? 'border-brand bg-brand-50'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={`block text-base font-bold ${
                  isActive ? 'text-brand' : 'text-slate-900'
                }`}
              >
                {tab.label}
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">{tab.hint}</span>
            </>
          )}
        </NavLink>
      ))}
    </div>
  </div>
);

export default AddPatientTabs;
