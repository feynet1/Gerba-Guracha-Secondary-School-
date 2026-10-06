import { Navigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import LoadingScreen from '../components/common/LoadingScreen';

function RoleRoute({ allowedRoles = [], children }) {
  const { role, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!allowedRoles.includes(role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}

export default RoleRoute;
