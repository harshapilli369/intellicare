import { createContext, useContext, useEffect, useState } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

// Each role lands on its own area after signing in.
export const homePathFor = (role) =>
  ({ clinician: '/clinician', admin: '/admin', patient: '/patient' }[role] || '/login');

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On load, restore the signed-in user from the token so a refresh keeps the
  // session rather than bouncing to the login page.
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then(({ data }) => setUser(data.user))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', data.token);
    setUser(data.user);
    return data.user;
  };

  // Public sign-up. The account comes back as a patient whatever is sent, so the
  // caller uses the role on the response rather than assuming one.
  const register = async ({ name, email, password, phone }) => {
    const { data } = await api.post('/auth/register', { name, email, password, phone });
    localStorage.setItem('token', data.token);
    setUser(data.user);
    return data.user;
  };

  // Takes up a session that was established somewhere other than the sign-in
  // form - redeeming an invitation, which ends with the account signed in. The
  // token is already stored by then; this is what tells the rest of the app.
  const adopt = (account) => setUser(account);

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, adopt }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
