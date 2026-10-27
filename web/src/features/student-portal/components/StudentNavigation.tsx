import { useId, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { routePaths } from '../../../app/router/routePaths';
import NavigationIcon from '../../../layouts/components/NavigationIcon';

const groups = [
  {
    label: 'Overview',
    items: [
      { label: 'Overview', path: routePaths.studentHome, icon: 'dashboard' },
      {
        label: 'Accommodation',
        path: routePaths.ownStudentAccommodation,
        icon: 'building',
      },
    ],
  },
  {
    label: 'My account',
    items: [
      {
        label: 'My profile',
        path: routePaths.ownStudentProfile,
        icon: 'profile',
      },
      { label: 'My QR code', path: routePaths.ownStudentQR, icon: 'qr' },
    ],
  },
  {
    label: 'Operations',
    items: [
      {
        label: 'Attendance',
        path: routePaths.ownStudentAttendance,
        icon: 'attendance',
      },
      { label: 'Leave requests', path: routePaths.ownLeaves, icon: 'leave' },
      {
        label: 'Access requests',
        path: routePaths.ownLateAccess,
        icon: 'access',
      },
      {
        label: 'Complaints',
        path: routePaths.ownComplaints,
        icon: 'complaints',
      },
    ],
  },
  {
    label: 'Communication',
    items: [
      {
        label: 'Announcements',
        path: routePaths.ownAnnouncements,
        icon: 'announcements',
      },
      {
        label: 'Notifications',
        path: routePaths.ownNotifications,
        icon: 'bell',
      },
    ],
  },
] as const;

export default function StudentNavigation() {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const id = useId();
  function close() {
    setOpen(false);
    toggle.current?.focus();
  }
  return (
    <div
      className="student-navigation"
      data-open={open}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          close();
        }
      }}
    >
      <button
        type="button"
        className="student-navigation-toggle"
        ref={toggle}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <span>
          {open ? 'Close student navigation' : 'Open student navigation'}
        </span>
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      <nav
        id={id}
        aria-label="Student navigation"
        className="sidebar-nav student-sidebar-links"
      >
        {groups.map((group) => (
          <div className="sidebar-nav-group" key={group.label}>
            <h2 className="sidebar-group-heading">{group.label}</h2>
            <ul aria-label={`${group.label} navigation`}>
              {group.items.map((item) => (
                <li key={item.path}>
                  <NavLink
                    end={item.path === routePaths.studentHome}
                    to={item.path}
                    onClick={() => {
                      if (open) close();
                    }}
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
        ))}
      </nav>
    </div>
  );
}
