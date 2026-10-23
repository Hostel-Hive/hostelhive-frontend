import type { dashboardNavigation } from '../../config/navigation';

type IconName = (typeof dashboardNavigation)[number]['icon'];
const paths: Record<IconName, string> = {
  dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  users:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  staff: 'M9 7V4h6v3 M3 7h18v14H3z M3 12a24 24 0 0 0 18 0 M10 12h4v3h-4z',
  students: 'm2 8 10-5 10 5-10 5z M6 10v6c4 3 8 3 12 0v-6 M22 8v9',
  building:
    'M5 21V3h14v18 M3 21h18 M9 7h1 M14 7h1 M9 11h1 M14 11h1 M10 21v-5h4v5',
  attendance: 'M9 3H5v18h14V3h-4 M9 2h6v4H9z m-1 12 2 2 6-6',
  reports: 'M4 3v18h17 M8 16v-4 M13 16V8 M18 16V5',
  leave:
    'M8 2v4 M16 2v4 M3 10h18 M4 4h16a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1 M8 15h8',
  access: 'M10 3H4v18h6 M8 12h13 m-4-4 4 4-4 4',
  announcements: 'm3 9 16-5v16L3 15z M3 9v6 M7 16l2 5h4l-2-4 M22 9v6',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
  complaints:
    'M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 1 1 17-5 M12 7v5 M12 15h.01',
};

export default function NavigationIcon({ name }: { name: IconName }) {
  return (
    <svg
      className="nav-icon"
      aria-hidden="true"
      focusable="false"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
