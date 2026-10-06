export const ROLE_OPTIONS = ['admin', 'director', 'teacher', 'registrar', 'student', 'parent'];

export const DASHBOARD_PATHS = {
  admin: '/admin',
  director: '/director',
  teacher: '/teacher',
  registrar: '/registrar',
  student: '/student',
  parent: '/parent',
};

export const getDashboardPathForRole = (role) => DASHBOARD_PATHS[role] || '/dashboard';

export const hasAllowedRole = (role, allowedRoles = []) => Boolean(role) && allowedRoles.includes(role);

export const normalizeRoleName = (role) => {
  if (!role) return 'Guest';
  return role.charAt(0).toUpperCase() + role.slice(1);
};
