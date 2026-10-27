import { routePaths } from '../app/router/routePaths';
import type { AuthAccount } from '../features/auth/auth.types';

export function dashboardForRole(role: AuthAccount['role']) {
  if (role === 'student') return routePaths.studentHome;
  return role === 'admin'
    ? routePaths.adminDashboard
    : routePaths.wardenDashboard;
}

export function homeForAccount(account: AuthAccount) {
  return account.role === 'student' && account.setup_required
    ? routePaths.studentSetup
    : dashboardForRole(account.role);
}
