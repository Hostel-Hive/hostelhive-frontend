import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '../../../app/App';
import {
  restoreStaffSession,
  subscribeStaffSession,
} from '../../auth/api/auth.api';
import { getOwnProfile } from '../../student-portal/api/student-portal.api';
import { ownStudentProfile } from '../../../test/fixtures/ownStudentProfile';
import {
  getUnreadCount,
  listNotifications,
  markNotificationRead,
} from '../api/notifications.api';
import {
  notificationFixture as row,
  notificationPage,
} from '../../../test/fixtures/notifications';
vi.mock('../../auth/api/auth.api', async (original) => ({
  ...(await original<typeof import('../../auth/api/auth.api')>()),
  restoreStaffSession: vi.fn(),
  subscribeStaffSession: vi.fn(),
}));
vi.mock('../../student-portal/api/student-portal.api', async (original) => ({
  ...(await original<
    typeof import('../../student-portal/api/student-portal.api')
  >()),
  getOwnProfile: vi.fn(),
}));
vi.mock('../api/notifications.api', async (original) => ({
  ...(await original<typeof import('../api/notifications.api')>()),
  getUnreadCount: vi.fn(),
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
}));
const account = {
  user_id: '11111111-1111-4111-8111-111111111111',
  firebase_uid: 'uid',
  email: 'staff@example.edu',
  role: 'admin' as const,
  is_active: true as const,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(restoreStaffSession).mockResolvedValue(account);
  vi.mocked(subscribeStaffSession).mockImplementation((change) => {
    let active = true;
    queueMicrotask(() => {
      if (active) change(true);
    });
    return () => {
      active = false;
    };
  });
  vi.mocked(getOwnProfile).mockResolvedValue(ownStudentProfile);
  vi.mocked(getUnreadCount).mockResolvedValue(1);
  vi.mocked(listNotifications).mockResolvedValue(notificationPage());
});
function at(path: string) {
  window.history.replaceState({}, '', path);
  return render(<App />);
}
it.each(['admin', 'warden', 'student'] as const)(
  'provides the protected owned inbox for %s',
  async (role) => {
    vi.mocked(restoreStaffSession).mockResolvedValue({ ...account, role });
    const base = role === 'student' ? '/student' : '/dashboard';
    at(`${base}/notifications`);
    expect(
      await screen.findByRole('heading', { name: 'Your inbox' }),
    ).toBeVisible();
    expect(
      await screen.findByRole('heading', { name: row.title }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Notifications' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      screen.getByRole('link', { name: 'Notifications, 1 unread' }),
    ).toHaveAttribute('href', `${base}/notifications`);
    expect(markNotificationRead).not.toHaveBeenCalled();
  },
);
it.each(['/student/notifications', '/dashboard/notifications'])(
  'redirects signed-out direct access from %s',
  async (path) => {
    vi.mocked(restoreStaffSession).mockResolvedValue(null);
    at(path);
    expect(
      await screen.findByRole('heading', { name: 'Sign in to HostelHive.' }),
    ).toBeVisible();
    expect(window.location.pathname).toBe(
      path.startsWith('/student') ? '/login' : '/staff/login',
    );
    expect(listNotifications).not.toHaveBeenCalled();
    expect(getUnreadCount).not.toHaveBeenCalled();
  },
);
it('requires student setup before inbox access', async () => {
  vi.mocked(restoreStaffSession).mockResolvedValue({
    ...account,
    role: 'student',
    setup_required: true,
  });
  at('/student/notifications');
  expect(
    await screen.findByRole('heading', { name: /Complete.*setup/i }),
  ).toBeVisible();
  expect(listNotifications).not.toHaveBeenCalled();
  expect(getUnreadCount).not.toHaveBeenCalled();
});
it('redirects student access away from the staff inbox', async () => {
  vi.mocked(restoreStaffSession).mockResolvedValue({
    ...account,
    role: 'student',
  });
  at('/dashboard/notifications');
  expect(
    await screen.findByRole('heading', { name: 'Welcome to HostelHive.' }),
  ).toBeVisible();
  expect(listNotifications).not.toHaveBeenCalled();
});
it('redirects staff access away from the student inbox', async () => {
  at('/student/notifications');
  expect(
    await screen.findByRole('heading', { name: 'Admin dashboard' }),
  ).toBeVisible();
  expect(listNotifications).not.toHaveBeenCalled();
});
