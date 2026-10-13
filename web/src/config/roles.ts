import { routePaths } from '../app/router/routePaths';
import type { StaffAccount } from '../features/auth/auth.types';

export function dashboardForRole(role: StaffAccount['role']) {
  return role === 'admin'
    ? routePaths.adminDashboard
    : routePaths.wardenDashboard;
}
