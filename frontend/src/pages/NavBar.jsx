export default function Sidebar() {
    return (
        <aside className="w-64 bg-white border-r border-slate-200 p-6">
        <h2 className="text-xl font-bold text-brand mb-6">IntelliCare</h2>

        <nav className="space-y-3">
          <a className="block text-slate-700 font-medium hover:text-brand" href="/patient/dashboard">
            Dashboard
          </a>
          <a className="block text-slate-700 font-medium hover:text-brand" href="/patient/info">
            Personal Information
          </a>
          <a className="block text-slate-700 font-medium hover:text-brand" href="/patient/appointments">
            Appointments
          </a>
        </nav>
      </aside>
    );
}