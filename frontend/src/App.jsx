import { Routes, Route, Navigate } from 'react-router-dom';

import { useAuth, homePathFor } from './context/AuthContext';
import ProtectedRoute from './routes/ProtectedRoute';
import AppLayout from './components/layout/AppLayout';

import Login from './pages/auth/Login';
import SignUp from './pages/auth/SignUp';
import AcceptInvitation from './pages/auth/AcceptInvitation';
import LaunchPage from './pages/LaunchPage';
import ClinicianDashboard from './pages/clinician/Dashboard';
import ClinicianSchedule from './pages/clinician/Schedule';
import AISummaries from './pages/clinician/AISummaries';
import AdminDashboard from './pages/admin/Dashboard';
import AdminAppointments from './pages/admin/Appointments';
import AddPatient from './pages/admin/AddPatient';
import ImportPatients from './pages/admin/ImportPatients';
import PatientDashboard from './pages/patient/Dashboard';
import PersonalInformation from './pages/patient/PersonalInformation';
import PatientSummaries from './pages/patient/Summaries';
import PatientAppointments from './pages/patient/Appointments';
import BookAppointment from './pages/patient/BookAppointment';
import PatientsList from './pages/patients/PatientsList';
import PatientDetail from './pages/patients/PatientDetail';
import PrintPrescription from './pages/prescriptions/PrintPrescription';

// Wraps a page for one role: requires sign-in, checks the role, and renders it
// inside the shared shell.
const rolePage = (roles, element) => (
  <ProtectedRoute roles={roles}>
    <AppLayout>{element}</AppLayout>
  </ProtectedRoute>
);

// Sends a signed-in user to their own area. A visitor who is not signed in gets
// the launch page rather than being pushed straight at a sign-in form.
const Home = () => {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to={homePathFor(user.role)} replace /> : <LaunchPage />;
};

const App = () => (
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/signup" element={<SignUp />} />
    {/* Public by necessity: an invited patient has no password yet, so this is
        the one screen they can reach before having an account they can use. */}
    <Route path="/invite/:token" element={<AcceptInvitation />} />
    <Route path="/clinician" element={rolePage(['clinician'], <ClinicianDashboard />)} />
    <Route path="/clinician/patients" element={rolePage(['clinician'], <PatientsList />)} />
    <Route path="/clinician/patients/:id" element={rolePage(['clinician'], <PatientDetail />)} />
    <Route path="/clinician/appointments" element={rolePage(['clinician'], <ClinicianSchedule />)} />
    <Route path="/clinician/ai-summaries" element={rolePage(['clinician'], <AISummaries />)} />
    <Route path="/admin" element={rolePage(['admin'], <AdminDashboard />)} />
    <Route path="/admin/appointments" element={rolePage(['admin'], <AdminAppointments />)} />
    <Route path="/admin/patients/new" element={rolePage(['admin'], <AddPatient />)} />
    <Route path="/admin/patients/import" element={rolePage(['admin'], <ImportPatients />)} />
    <Route path="/admin/patients" element={rolePage(['admin'], <PatientsList />)} />
    <Route path="/admin/patients/:id" element={rolePage(['admin'], <PatientDetail />)} />
    <Route path="/patient" element={rolePage(['patient'], <PatientDashboard />)} />
    <Route path="/patient/details" element={rolePage(['patient'], <PersonalInformation />)} />
    <Route path="/patient/appointments" element={rolePage(['patient'], <PatientAppointments />)} />
    <Route path="/patient/book" element={rolePage(['patient'], <BookAppointment />)} />
    <Route path="/patient/summaries" element={rolePage(['patient'], <PatientSummaries />)} />
    {/* Outside the shell: a printed sheet should carry no navigation. */}
    <Route
      path="/prescriptions/:id/print"
      element={
        <ProtectedRoute roles={['clinician', 'admin', 'patient']}>
          <PrintPrescription />
        </ProtectedRoute>
      }
    />
    <Route path="/" element={<Home />} />
    <Route path="*" element={<Home />} />
  </Routes>
);

export default App;
