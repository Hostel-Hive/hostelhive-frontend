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
  { label: 'Attendance', path: routePaths.attendance, role: 'all' },
  { label: 'Leave requests', path: routePaths.leaves, role: 'all' },
  { label: 'Access requests', path: routePaths.lateAccess, role: 'all' },
  { label: 'Announcements', path: routePaths.announcements, role: 'all' },
  { label: 'Notifications', path: routePaths.notifications, role: 'all' },
  { label: 'Complaints', path: routePaths.complaints, role: 'all' },
] as const;
