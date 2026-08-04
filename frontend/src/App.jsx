import { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import { useAuth, homePathFor } from './context/AuthContext';
import ProtectedRoute from './routes/ProtectedRoute';
import AppLayout from './components/layout/AppLayout';
import lazyWithReload from './utils/lazyWithReload';

// The screens somebody sees before they are signed in stay in the first bundle:
// making a visitor wait for a second request to be shown a login form would be
// slower, not faster.
import Login from './pages/auth/Login';
import SignUp from './pages/auth/SignUp';
import LaunchPage from './pages/LaunchPage';

// Everything behind a sign-in is fetched when it is first opened.
//
// `lazyWithReload` rather than React's `lazy`: a deployment renames every one of
// these files, and a browser still holding the previous index.html asks for
// names that have gone. See the note in that module - the recovery is a reload,
// and it happens without anybody being shown an error for it.
//
// One bundle meant a patient downloaded every administrative and clinical
// screen they will never be permitted to see - the import screen, the
// prescription pad, the AI summary editor - before their own dashboard could
// paint. Split by route, a browser asks for a screen when somebody navigates to
// it, and the chunks for the other two roles are never requested at all.
const AcceptInvitation = lazyWithReload(() => import('./pages/auth/AcceptInvitation'));
const ClinicianDashboard = lazyWithReload(() => import('./pages/clinician/Dashboard'));
const ClinicianSchedule = lazyWithReload(() => import('./pages/clinician/Schedule'));
const AISummaries = lazyWithReload(() => import('./pages/clinician/AISummaries'));
const AdminDashboard = lazyWithReload(() => import('./pages/admin/Dashboard'));
const AdminAppointments = lazyWithReload(() => import('./pages/admin/Appointments'));
const AddPatient = lazyWithReload(() => import('./pages/admin/AddPatient'));
const ImportPatients = lazyWithReload(() => import('./pages/admin/ImportPatients'));
const PatientDashboard = lazyWithReload(() => import('./pages/patient/Dashboard'));
const PersonalInformation = lazyWithReload(() => import('./pages/patient/PersonalInformation'));
const PatientSummaries = lazyWithReload(() => import('./pages/patient/Summaries'));
const PatientAppointments = lazyWithReload(() => import('./pages/patient/Appointments'));
const BookAppointment = lazyWithReload(() => import('./pages/patient/BookAppointment'));
const PatientsList = lazyWithReload(() => import('./pages/patients/PatientsList'));
const PatientDetail = lazyWithReload(() => import('./pages/patients/PatientDetail'));
const PrintPrescription = lazyWithReload(() => import('./pages/prescriptions/PrintPrescription'));

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

// What is shown while a screen's own chunk is being fetched. Deliberately
// plain: on any ordinary connection it is visible for a few tens of
// milliseconds, and a spinner that flashes is worse than a line of text.
const Loading = () => <p className="p-8 text-sm text-slate-500">Loading...</p>;

const App = () => (
  <Suspense fallback={<Loading />}>
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
  </Suspense>
);

export default App;
