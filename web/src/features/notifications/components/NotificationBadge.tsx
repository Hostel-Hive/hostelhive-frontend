import { Link } from 'react-router-dom';
import useAuth from '../../auth/hooks/useAuth';
import useUnreadCount from '../hooks/useUnreadCount';
import '../../../styles/notifications.css';

export default function NotificationBadge() {
  const { account } = useAuth();
  return account && !('setup_required' in account && account.setup_required) ? (
    <Badge
      key={`${account.firebase_uid}:${account.role}`}
      uid={account.firebase_uid}
      role={account.role}
    />
  ) : null;
}
function Badge({
  uid,
  role,
}: {
  uid: string;
  role: 'admin' | 'warden' | 'student';
}) {
  const { count, error } = useUnreadCount(uid, role);
  return (
    <Link
      className="notification-badge"
      to={
        role === 'student'
          ? '/student/notifications'
          : '/dashboard/notifications'
      }
      aria-label={
        count === undefined
          ? error
            ? 'Notifications, unread count unavailable'
            : 'Notifications, checking unread count'
          : `Notifications, ${count} unread`
      }
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      </svg>
      <span>Notifications</span>
      <span className="notification-badge__count" aria-hidden="true">
        {count === undefined ? (error ? '!' : '…') : count > 99 ? '99+' : count}
      </span>
    </Link>
  );
}
