import React from "react";
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import LaunchPage from './pages/LaunchPage';
import SignIn from './pages/SignIn';
import SignUp from './pages/SignUp';

import AdminDashboard from './pages/AdminDashboard';
import PatientDashboard from './pages/PatientDashboard';
import PhysicianDashboard from './pages/PhysicianDashboard';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LaunchPage />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />

        <Route path="/admin-dashboard" element={
            <ProtectedRoute>
              <AdminDashboard />
              <PatientDashboard />
              <PhysicianDashboard />
            </ProtectedRoute>
          } />
      </Routes>
    </BrowserRouter>
  );
}

export default App