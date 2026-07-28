import { useAuth } from '../../context/AuthContext';

const AdminDashboard = () => {
  const { user } = useAuth();
  return (
    <div>
      <h1 className="text-2xl font-bold">Administration Dashboard</h1>
      <p className="mt-2 text-slate-600">
        Welcome, {user?.name}. Patient onboarding, appointments, and records will appear here.
      </p>
    </div>
  );
};

export default AdminDashboard;
