import { routePaths } from '../app/router/routePaths';

export const dashboardNavigation = [
  { label: 'Admin dashboard', path: routePaths.adminDashboard, role: 'admin' },
  {
    label: 'Warden dashboard',
    path: routePaths.wardenDashboard,
    role: 'warden',
  },
  { label: 'Students', path: routePaths.students, role: 'all' },
  { label: 'Inventory', path: routePaths.inventory, role: 'all' },
  { label: 'Leave requests', path: routePaths.leaves, role: 'all' },
  { label: 'Access requests', path: routePaths.lateAccess, role: 'all' },
] as const;
