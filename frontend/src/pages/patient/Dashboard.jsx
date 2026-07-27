import { useAuth } from '../../context/AuthContext';

const PatientDashboard = () => {
  const { user } = useAuth();
  return (
    <div>
      <h1 className="text-2xl font-bold">My Health</h1>
      <p className="mt-2 text-slate-600">
        Welcome, {user?.name}. Your appointments, summaries, and intake forms will appear here.
      </p>
    </div>
  );
};

export default PatientDashboard;
