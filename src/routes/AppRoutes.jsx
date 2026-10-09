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
import { useAuth } from '../context/useAuth';
import { getDashboardPathForRole } from '../utils/auth';
import StudentsPage, {
  MyStudentProfilePage,
  ParentChildrenPage,
  StudentFormPage,
  StudentProfilePage,
} from '../pages/students/StudentsPages';
import ClassesPage, {
  ClassDetailsPage,
  ParentDetailsPage,
  ParentsPage,
} from '../pages/management/ClassesParentsPages';
import {
  MyTeacherProfilePage,
  SubjectDetailsPage,
  SubjectFormPage,
  SubjectsPage,
  TeacherAssignmentsPage,
  TeacherDetailsPage,
  TeacherFormPage,
  TeachersPage,
  TimetableEntryFormPage,
  TimetablePage,
  TimetableSettingsPage,
} from '../pages/phase3/Phase3Pages';

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
            path="/students"
            element={<RoleRoute allowedRoles={['admin', 'registrar', 'director']}><StudentsPage /></RoleRoute>}
          />
          <Route
            path="/students/new"
            element={<RoleRoute allowedRoles={['admin', 'registrar']}><StudentFormPage /></RoleRoute>}
          />
          <Route
            path="/students/:studentId/edit"
            element={<RoleRoute allowedRoles={['admin', 'registrar']}><StudentFormPage /></RoleRoute>}
          />
          <Route
            path="/students/:studentId"
            element={<RoleRoute allowedRoles={['admin', 'registrar', 'director']}><StudentProfilePage /></RoleRoute>}
          />
          <Route
            path="/classes"
            element={<RoleRoute allowedRoles={['admin', 'registrar', 'director']}><ClassesPage /></RoleRoute>}
          />
          <Route
            path="/classes/:classId"
            element={<RoleRoute allowedRoles={['admin', 'registrar', 'director']}><ClassDetailsPage /></RoleRoute>}
          />
          <Route
            path="/classes/:classId/edit"
            element={<RoleRoute allowedRoles={['admin', 'registrar']}><ClassesPage /></RoleRoute>}
          />
          <Route
            path="/parents"
            element={<RoleRoute allowedRoles={['admin', 'registrar', 'director']}><ParentsPage /></RoleRoute>}
          />
          <Route
            path="/parents/:parentId"
            element={<RoleRoute allowedRoles={['admin', 'registrar', 'director']}><ParentDetailsPage /></RoleRoute>}
          />
          <Route
            path="/parents/:parentId/edit"
            element={<RoleRoute allowedRoles={['admin', 'registrar']}><ParentsPage /></RoleRoute>}
          />
          <Route
            path="/student/profile"
            element={<RoleRoute allowedRoles={['student']}><MyStudentProfilePage /></RoleRoute>}
          />
          <Route
            path="/parent/children"
            element={<RoleRoute allowedRoles={['parent']}><ParentChildrenPage /></RoleRoute>}
          />
          <Route
            path="/teachers"
            element={<RoleRoute allowedRoles={['admin', 'director']}><TeachersPage /></RoleRoute>}
          />
          <Route
            path="/teachers/new"
            element={<RoleRoute allowedRoles={['admin']}><TeacherFormPage /></RoleRoute>}
          />
          <Route
            path="/teachers/:teacherId"
            element={<RoleRoute allowedRoles={['admin', 'director']}><TeacherDetailsPage /></RoleRoute>}
          />
          <Route
            path="/teachers/:teacherId/edit"
            element={<RoleRoute allowedRoles={['admin']}><TeacherFormPage /></RoleRoute>}
          />
          <Route
            path="/teacher/profile"
            element={<RoleRoute allowedRoles={['teacher']}><MyTeacherProfilePage /></RoleRoute>}
          />
          <Route
            path="/subjects"
            element={<RoleRoute allowedRoles={['admin', 'director', 'teacher']}><SubjectsPage /></RoleRoute>}
          />
          <Route
            path="/subjects/new"
            element={<RoleRoute allowedRoles={['admin']}><SubjectFormPage /></RoleRoute>}
          />
          <Route
            path="/subjects/:subjectId"
            element={<RoleRoute allowedRoles={['admin', 'director', 'teacher']}><SubjectDetailsPage /></RoleRoute>}
          />
          <Route
            path="/subjects/:subjectId/edit"
            element={<RoleRoute allowedRoles={['admin']}><SubjectFormPage /></RoleRoute>}
          />
          <Route
            path="/teacher-assignments/new"
            element={<RoleRoute allowedRoles={['admin']}><TeacherAssignmentsPage /></RoleRoute>}
          />
          <Route
            path="/teacher-assignments"
            element={<RoleRoute allowedRoles={['admin', 'director', 'teacher']}><TeacherAssignmentsPage /></RoleRoute>}
          />
          <Route
            path="/timetable/settings"
            element={<RoleRoute allowedRoles={['admin']}><TimetableSettingsPage /></RoleRoute>}
          />
          <Route
            path="/timetable/new"
            element={<RoleRoute allowedRoles={['admin']}><TimetableEntryFormPage /></RoleRoute>}
          />
          <Route
            path="/timetable/classes/:classId"
            element={<RoleRoute allowedRoles={['admin', 'director', 'teacher']}><TimetablePage /></RoleRoute>}
          />
          <Route
            path="/timetable/teachers/:teacherId"
            element={<RoleRoute allowedRoles={['admin', 'director', 'teacher']}><TimetablePage /></RoleRoute>}
          />
          <Route
            path="/timetable/:entryId/edit"
            element={<RoleRoute allowedRoles={['admin']}><TimetableEntryFormPage /></RoleRoute>}
          />
          <Route
            path="/timetable"
            element={<RoleRoute allowedRoles={['admin', 'director', 'teacher']}><TimetablePage /></RoleRoute>}
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
