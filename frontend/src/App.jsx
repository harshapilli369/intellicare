import { Routes, Route, Navigate } from 'react-router-dom';

import { useAuth, homePathFor } from './context/AuthContext';
import ProtectedRoute from './routes/ProtectedRoute';
import AppLayout from './components/layout/AppLayout';

import Login from './pages/auth/Login';
import ClinicianDashboard from './pages/clinician/Dashboard';
import AdminDashboard from './pages/admin/Dashboard';
import PatientDashboard from './pages/patient/Dashboard';

// Wraps a page for one role: requires sign-in, checks the role, and renders it
// inside the shared shell.
const rolePage = (roles, element) => (
  <ProtectedRoute roles={roles}>
    <AppLayout>{element}</AppLayout>
  </ProtectedRoute>
);

// Sends the root path to the signed-in user's own area, or to sign in.
const Home = () => {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={user ? homePathFor(user.role) : '/login'} replace />;
};

const App = () => (
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/clinician" element={rolePage(['clinician'], <ClinicianDashboard />)} />
    <Route path="/admin" element={rolePage(['admin'], <AdminDashboard />)} />
    <Route path="/patient" element={rolePage(['patient'], <PatientDashboard />)} />
    <Route path="/" element={<Home />} />
    <Route path="*" element={<Home />} />
  </Routes>
);

export default App;
