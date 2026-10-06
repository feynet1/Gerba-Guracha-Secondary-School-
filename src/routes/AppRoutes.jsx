import { Navigate, Route, Routes } from 'react-router-dom';

import MainLayout from '../layouts/MainLayout';
import AdminDashboard from '../pages/admin/AdminDashboard';
import UserManagementPage from '../pages/admin/UserManagementPage';
import DashboardPage from '../pages/DashboardPage';
import DirectorDashboard from '../pages/director/DirectorDashboard';
import ParentDashboard from '../pages/parent/ParentDashboard';
import RegistrarDashboard from '../pages/registrar/RegistrarDashboard';
import StudentDashboard from '../pages/student/StudentDashboard';
import TeacherDashboard from '../pages/teacher/TeacherDashboard';
import ForgotPasswordPage from '../pages/auth/ForgotPasswordPage';
import LoginPage from '../pages/auth/LoginPage';
import UnauthorizedPage from '../pages/auth/UnauthorizedPage';
import ProtectedRoute from './ProtectedRoute';
import RoleRoute from './RoleRoute';
import LoadingScreen from '../components/common/LoadingScreen';
import { useAuth } from '../context/AuthContext';
import { getDashboardPathForRole } from '../utils/auth';

function RootRedirect() {
  const { isAuthenticated, role, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={getDashboardPathForRole(role)} replace />;
}

function AppRoutes() {
  const { user, role } = useAuth();

  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<MainLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />

          <Route
            path="/admin"
            element={<RoleRoute allowedRoles={['admin']}><AdminDashboard /></RoleRoute>}
          />
          <Route
            path="/admin/users"
            element={<RoleRoute allowedRoles={['admin']}><UserManagementPage /></RoleRoute>}
          />

          <Route
            path="/director"
            element={<RoleRoute allowedRoles={['director']}><DirectorDashboard /></RoleRoute>}
          />
          <Route
            path="/teacher"
            element={<RoleRoute allowedRoles={['teacher']}><TeacherDashboard /></RoleRoute>}
          />
          <Route
            path="/registrar"
            element={<RoleRoute allowedRoles={['registrar']}><RegistrarDashboard /></RoleRoute>}
          />
          <Route
            path="/student"
            element={<RoleRoute allowedRoles={['student']}><StudentDashboard /></RoleRoute>}
          />
          <Route
            path="/parent"
            element={<RoleRoute allowedRoles={['parent']}><ParentDashboard /></RoleRoute>}
          />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to={user ? getDashboardPathForRole(role) : '/login'} replace />} />
    </Routes>
  );
}

export default AppRoutes;
