import { Navigate } from 'react-router-dom';
import { useAuth, homePathFor } from '../context/AuthContext';

// Guards a route. An unauthenticated user is sent to sign in. A signed-in user
// whose role is not allowed here is sent to their own area rather than shown a
// page meant for another role.
const ProtectedRoute = ({ children, roles }) => {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={homePathFor(user.role)} replace />;
  }

  return children;
};

export default ProtectedRoute;
