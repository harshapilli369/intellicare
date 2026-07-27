import { useAuth } from '../../context/AuthContext';

const ClinicianDashboard = () => {
  const { user } = useAuth();
  return (
    <div>
      <h1 className="text-2xl font-bold">Clinician Dashboard</h1>
      <p className="mt-2 text-slate-600">
        Welcome, {user?.name}. Your patients, schedule, and AI summaries will appear here.
      </p>
    </div>
  );
};

export default ClinicianDashboard;
