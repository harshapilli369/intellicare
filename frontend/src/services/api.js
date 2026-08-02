import axios from 'axios';

// Where the backend is. In development this stays relative, and Vite proxies
// /api to the local server. Once the two are deployed apart - the frontend on
// one host, the API on another - a relative path would resolve to the frontend's
// own origin and find nothing, so the deployed build is given the API's address
// through VITE_API_URL at build time.
const API_URL = import.meta.env.VITE_API_URL;
const api = axios.create({ baseURL: API_URL ? `${API_URL.replace(/\/$/, '')}/api` : '/api' });

// Attach the stored token to every request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// A rejected token means the session is no longer valid; clear it and send the
// user back to sign in.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      if (window.location.pathname !== '/login') window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
