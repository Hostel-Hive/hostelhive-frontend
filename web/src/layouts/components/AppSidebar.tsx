import { NavLink } from 'react-router-dom';
import { dashboardNavigation } from '../../config/navigation';
import useAuth from '../../features/auth/hooks/useAuth';

interface AppSidebarProps {
  label?: string;
  onNavigate?: () => void;
}

export default function AppSidebar({
  label = 'Primary navigation',
  onNavigate,
}: AppSidebarProps) {
  const { account } = useAuth();
  return (
    <nav aria-label={label} className="sidebar-nav">
      <ul>
        {dashboardNavigation
          .filter(
            (item) =>
              item.role === account?.role ||
              (item.role === 'all' && Boolean(account)),
          )
          .map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                end={item.role !== 'all'}
                onClick={onNavigate}
                className={({ isActive }) =>
                  isActive ? 'nav-link nav-link--active' : 'nav-link'
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
      </ul>
    </nav>
  );
}
