import { NavLink } from 'react-router-dom';
import { dashboardNavigation } from '../../config/navigation';

interface AppSidebarProps {
  label?: string;
  onNavigate?: () => void;
}

export default function AppSidebar({
  label = 'Primary navigation',
  onNavigate,
}: AppSidebarProps) {
  return (
    <nav aria-label={label} className="sidebar-nav">
      <ul>
        {dashboardNavigation.map((item) => (
          <li key={item.path}>
            <NavLink
              to={item.path}
              end
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
