import { routePaths } from '../app/router/routePaths';

export const dashboardNavigation = [
  { label: 'Admin dashboard', path: routePaths.adminDashboard },
  { label: 'Warden dashboard', path: routePaths.wardenDashboard },
] as const;
