import { describe, expect, it } from 'vitest';

import { DASHBOARD_PATHS, getDashboardPathForRole, hasAllowedRole, ROLE_OPTIONS } from './auth';

describe('authentication utilities', () => {
  it('supports all expected roles', () => {
    expect(ROLE_OPTIONS).toEqual(['admin', 'director', 'teacher', 'registrar', 'student', 'parent']);
  });

  it('returns the correct dashboard path for each role', () => {
    expect(getDashboardPathForRole('admin')).toBe(DASHBOARD_PATHS.admin);
    expect(getDashboardPathForRole('teacher')).toBe(DASHBOARD_PATHS.teacher);
    expect(getDashboardPathForRole('guest')).toBe('/dashboard');
  });

  it('only allows valid access for supported roles', () => {
    expect(hasAllowedRole('admin', ['admin', 'teacher'])).toBe(true);
    expect(hasAllowedRole('parent', ['admin'])).toBe(false);
    expect(hasAllowedRole('', ['admin'])).toBe(false);
  });
});
