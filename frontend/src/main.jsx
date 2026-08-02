import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';

import App from './App';
import ErrorBoundary from './components/common/ErrorBoundary';
import { AuthProvider } from './context/AuthContext';

import './styles/index.css';
import 'react-toastify/dist/ReactToastify.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Outside the router, so a rendering error anywhere - including in the
        routing itself - still lands on a page with a way out of it, rather
        than on a blank white screen. */}
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <App />
          <ToastContainer position="bottom-right" autoClose={3000} />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
