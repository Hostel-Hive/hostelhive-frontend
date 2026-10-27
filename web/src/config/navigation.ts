import { routePaths } from '../app/router/routePaths';

export const dashboardNavigation = [
  {
    label: 'Admin dashboard',
    path: routePaths.adminDashboard,
    role: 'admin',
    group: 'Overview',
    icon: 'dashboard',
  },
  {
    label: 'User management',
    path: routePaths.users,
    role: 'admin',
    group: 'People',
    icon: 'users',
  },
  {
    label: 'Staff management',
    path: routePaths.staff,
    role: 'admin',
    end: false,
    group: 'People',
    icon: 'staff',
  },
  {
    label: 'Warden dashboard',
    path: routePaths.wardenDashboard,
    role: 'warden',
    group: 'Overview',
    icon: 'dashboard',
  },
  {
    label: 'Students',
    path: routePaths.students,
    role: 'all',
    group: 'People',
    icon: 'students',
  },
  {
    label: 'Inventory',
    path: routePaths.inventory,
    role: 'all',
    group: 'Overview',
    icon: 'building',
  },
  {
    label: 'Attendance',
    path: routePaths.attendance,
    role: 'all',
    group: 'Operations',
    icon: 'attendance',
  },
  {
    label: 'Reports',
    path: routePaths.reports,
    role: 'all',
    group: 'Overview',
    icon: 'reports',
  },
  {
    label: 'Leave requests',
    path: routePaths.leaves,
    role: 'all',
    group: 'Operations',
    icon: 'leave',
  },
  {
    label: 'Access requests',
    path: routePaths.lateAccess,
    role: 'all',
    group: 'Operations',
    icon: 'access',
  },
  {
    label: 'Announcements',
    path: routePaths.announcements,
    role: 'all',
    group: 'Communication',
    icon: 'announcements',
  },
  {
    label: 'Notifications',
    path: routePaths.notifications,
    role: 'all',
    group: 'Communication',
    icon: 'bell',
  },
  {
    label: 'Complaints',
    path: routePaths.complaints,
    role: 'all',
    group: 'Operations',
    icon: 'complaints',
  },
] as const;

export const dashboardNavigationGroups = [
  'Overview',
  'People',
  'Operations',
  'Communication',
] as const;
