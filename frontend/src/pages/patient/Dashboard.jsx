import { useAuth } from "../../context/AuthContext";
import NavBar from "../NavBar";

const PatientDashboard = () => {
  const { user } = useAuth();

  let num_summaries = 0;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <NavBar />
      {/* Main Content */}
      <main className="flex-1 p-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Welcome, {user?.name || "Patient"}
            </h1>
            <p className="text-slate-600 mt-1">
              Your health information at a glance.
            </p>
          </div>

          <input
            type="text"
            placeholder="Search..."
            className="rounded-md border border-slate-300 px-3 py-2 text-sm w-64"
          />
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-4 mt-8">
          <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
            <p className="text-sm text-slate-600">Referrals to act on</p>
            <p className="text-2xl font-bold text-brand">{user?.referrals || 0}</p>
          </div>

          <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
            <p className="text-sm text-slate-600">Booked appointments</p>
            <p className="text-2xl font-bold text-brand">{user?.bookedAppointments || 0}</p>
          </div>

          <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
            <p className="text-sm text-slate-600">Prescription refill almost expired</p>
            <p className="text-2xl font-bold text-brand">{user?.prescriptions || 0}</p>
          </div>
        </div>

        {/* Upcoming Appointment */}
        <div className="mt-8 bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold text-slate-900">Upcoming Appointment</h3>

          <div className="mt-4">
            <p className="font-medium text-slate-800">{user.appointment.physicianId?.name || "No Appointments"}</p>
            <p className="text-slate-600">{user.appointment.reason}</p>
            <p className="text-slate-600">{user.appointment.startTime}</p>

            <button className="mt-4 px-4 py-2 bg-brand text-white rounded-md text-sm font-medium">
              View Info
            </button>
          </div>
        </div>

        {/* Post-Appointment Summary */}
        <div className="mt-6 bg-green-100 border border-green-300 p-6 rounded-lg">
          <p className="font-medium text-green-800">
            {user.appointment.numSummaries} post‑appointment summary is waiting for you!
          </p>

          <button className="mt-3 px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium">
            View Report
          </button>
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex gap-4">
          <button className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium">
            View All Appointment Reports
          </button>

          <button className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium">
            Book an Appointment
          </button>
        </div>
      </main>
    </div>
  );
};

export default PatientDashboard;
