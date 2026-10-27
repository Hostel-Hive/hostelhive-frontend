import { NavLink } from 'react-router-dom';
import {
  dashboardNavigation,
  dashboardNavigationGroups,
} from '../../config/navigation';
import NavigationIcon from './NavigationIcon';
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
  const visibleItems = dashboardNavigation.filter(
    (item) =>
      item.role === account?.role || (item.role === 'all' && Boolean(account)),
  );
  return (
    <nav aria-label={label} className="sidebar-nav">
      {dashboardNavigationGroups.map((group) => {
        const items = visibleItems.filter((item) => item.group === group);
        if (!items.length) return null;
        return (
          <div className="sidebar-nav-group" key={group}>
            <h2 className="sidebar-group-heading">{group}</h2>
            <ul aria-label={`${group} navigation`}>
              {items.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    end={'end' in item ? item.end : item.role !== 'all'}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      isActive ? 'nav-link nav-link--active' : 'nav-link'
                    }
                  >
                    <NavigationIcon name={item.icon} />
                    <span>{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
