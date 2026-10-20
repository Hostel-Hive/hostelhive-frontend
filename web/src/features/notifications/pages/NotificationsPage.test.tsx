import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import useAuth from '../../auth/hooks/useAuth';
import NotificationsPage from './NotificationsPage';
import NotificationBadge from '../components/NotificationBadge';
import {
  getUnreadCount,
  listNotifications,
  markNotificationRead,
  NotificationError,
} from '../api/notifications.api';
import {
  notificationFixture as row,
  notificationPage as page,
  readNotification,
} from '../../../test/fixtures/notifications';
vi.mock('../../auth/hooks/useAuth', () => ({ default: vi.fn() }));
vi.mock('../api/notifications.api', async (original) => ({
  ...(await original<typeof import('../api/notifications.api')>()),
  getUnreadCount: vi.fn(),
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
}));
const account = {
  user_id: 'user-id',
  firebase_uid: 'uid',
  email: 'student@example.edu',
  role: 'student' as const,
  is_active: true as const,
};
const verify = vi.fn();
const signOut = vi.fn();
function auth(role: 'admin' | 'warden' | 'student' = 'student', uid = 'uid') {
  vi.mocked(useAuth).mockReturnValue({
    account: { ...account, role, firebase_uid: uid },
    status: 'authenticated',
    message: '',
    verifiedPath: '/student/notifications',
    busy: false,
    signIn: vi.fn(),
    retry: verify,
    signOut,
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  auth();
  verify.mockResolvedValue(undefined);
  signOut.mockResolvedValue(undefined);
  vi.mocked(listNotifications).mockResolvedValue(page());
  vi.mocked(getUnreadCount).mockResolvedValue(3);
  vi.mocked(markNotificationRead).mockResolvedValue(readNotification);
});
function open(badge = false) {
  return render(
    <MemoryRouter>
      {badge && <NotificationBadge />}
      <NotificationsPage />
    </MemoryRouter>,
  );
}
const openRow = () =>
  screen.getByRole('button', { name: `Open notification: ${row.title}` });
it('lists escaped notification snapshots without marking on load, focus or count refresh', async () => {
  vi.mocked(listNotifications).mockResolvedValue(
    page([{ ...row, title: '<img src=x onerror=alert(1)>' }]),
  );
  open();
  expect(
    await screen.findByRole('heading', {
      name: '<img src=x onerror=alert(1)>',
    }),
  ).toBeVisible();
  expect(document.querySelector('img')).toBeNull();
  expect(screen.getByText('3 unread notifications.')).toBeVisible();
  fireEvent(window, new Event('focus'));
  await waitFor(() => expect(getUnreadCount).toHaveBeenCalledTimes(2));
  expect(markNotificationRead).not.toHaveBeenCalled();
});
it.each(['student', 'admin', 'warden'] as const)(
  'opens a notification intentionally and links to the %s source',
  async (role) => {
    auth(role);
    open(true);
    await screen.findByRole('button', {
      name: `Open notification: ${row.title}`,
    });
    vi.mocked(getUnreadCount).mockResolvedValue(2);
    vi.mocked(listNotifications).mockResolvedValue(page([readNotification]));
    fireEvent.click(openRow());
    const related = await screen.findByRole('link', {
      name: 'View related complaint',
    });
    expect(related).toHaveAttribute(
      'href',
      `${role === 'student' ? '/student' : '/dashboard'}/complaints/${row.complaint_id}`,
    );
    await waitFor(() =>
      expect(screen.getByText('2 unread notifications.')).toBeVisible(),
    );
    expect(
      screen.getByRole('link', { name: 'Notifications, 2 unread' }),
    ).toBeVisible();
    expect(markNotificationRead).toHaveBeenCalledTimes(1);
    expect(markNotificationRead).toHaveBeenCalledWith(
      row.notification_id,
      'uid',
      expect.any(AbortSignal),
    );
    expect(screen.getByRole('region', { name: row.title })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Close notification' }));
    expect(
      screen.queryByRole('link', { name: 'View related complaint' }),
    ).toBeNull();
    expect(screen.getByRole('region', { name: 'Inbox results' })).toHaveFocus();
    fireEvent.click(openRow());
    expect(markNotificationRead).toHaveBeenCalledTimes(1);
  },
);
it('removes read items from an unread filter while preserving the opened event', async () => {
  open();
  await screen.findByText(row.title);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Unread only' }));
  await waitFor(() =>
    expect(listNotifications).toHaveBeenLastCalledWith(
      'uid',
      expect.any(AbortSignal),
      true,
      0,
    ),
  );
  await screen.findByText(row.title);
  vi.mocked(listNotifications).mockResolvedValue(page([]));
  fireEvent.click(openRow());
  expect(
    await screen.findByText('You have no unread notifications.'),
  ).toBeVisible();
  expect(screen.getByRole('region', { name: row.title })).toBeVisible();
});
it('paginates and resets page on filter and refresh', async () => {
  const items = Array.from({ length: 20 }, (_, i) => ({
    ...row,
    notification_id: `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`,
    title: `Notice ${i}`,
  }));
  vi.mocked(listNotifications).mockImplementation(
    async (_uid, _signal, unread, offset = 0) =>
      unread ? page([]) : page(offset ? [] : items, offset, 21),
  );
  open();
  await screen.findByText('Notice 0');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(
    await screen.findByText(
      'No notifications on this page. Use Previous or refresh.',
    ),
  ).toBeVisible();
  expect(screen.getByRole('region', { name: 'Inbox results' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  await screen.findByText('Notice 0');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('Page 2');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh inbox' }));
  await screen.findByText('Notice 0');
  expect(screen.getByText('Page 1')).toBeVisible();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Unread only' }));
  expect(
    await screen.findByText('You have no unread notifications.'),
  ).toBeVisible();
});
it('handles empty results and service retry without fabricating a count', async () => {
  vi.mocked(listNotifications)
    .mockRejectedValueOnce(new Error('network'))
    .mockResolvedValue(page([]));
  vi.mocked(getUnreadCount).mockRejectedValue(new Error('network'));
  open(true);
  fireEvent.click(await screen.findByRole('button', { name: 'Retry inbox' }));
  expect(await screen.findByText('Your inbox is empty.')).toBeVisible();
  expect(
    screen.getByRole('link', {
      name: 'Notifications, unread count unavailable',
    }),
  ).toHaveTextContent('!');
  vi.mocked(getUnreadCount).mockResolvedValue(0);
  fireEvent.click(screen.getByRole('button', { name: 'Retry unread count' }));
  expect(await screen.findByText('0 unread notifications.')).toBeVisible();
});
it('prevents double submissions and retries exactly the same notification after an unknown outcome', async () => {
  let reject!: (e: unknown) => void;
  vi.mocked(markNotificationRead).mockImplementationOnce(
    () =>
      new Promise((_resolve, no) => {
        reject = no;
      }),
  );
  open();
  await screen.findByText(row.title);
  fireEvent.click(openRow());
  fireEvent.click(openRow());
  expect(markNotificationRead).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Refresh inbox' })).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Close notification' }),
  ).toBeDisabled();
  await act(async () => reject(new Error('network')));
  expect(screen.getByRole('alert')).toHaveTextContent('may already be saved');
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry marking as read' }),
  );
  await waitFor(() => expect(markNotificationRead).toHaveBeenCalledTimes(2));
  expect(
    vi.mocked(markNotificationRead).mock.calls.map((call) => call.slice(0, 2)),
  ).toEqual([
    [row.notification_id, 'uid'],
    [row.notification_id, 'uid'],
  ]);
});
it('leaves a confirmed read visible when the following list refresh fails', async () => {
  open();
  await screen.findByText(row.title);
  vi.mocked(listNotifications).mockRejectedValue(new Error('network'));
  fireEvent.click(openRow());
  await screen.findByRole('button', { name: 'Retry inbox' });
  expect(
    screen.getByRole('link', { name: 'View related complaint' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Retry marking as read' }),
  ).toBeNull();
});
it('rejects a mismatched source acknowledgement and preserves the original source', async () => {
  vi.mocked(markNotificationRead).mockResolvedValue({
    ...readNotification,
    complaint_id: row.notification_id,
  });
  open();
  await screen.findByText(row.title);
  fireEvent.click(openRow());
  expect(
    await screen.findByRole('button', { name: 'Retry marking as read' }),
  ).toBeVisible();
  expect(
    screen.getByRole('link', { name: 'View related complaint' }),
  ).toHaveAttribute('href', `/student/complaints/${row.complaint_id}`);
});
it('handles a removed notification without a blind retry', async () => {
  vi.mocked(markNotificationRead).mockRejectedValue(
    new NotificationError(
      'not-found',
      'Notification unavailable. Refresh the inbox.',
    ),
  );
  open();
  await screen.findByText(row.title);
  fireEvent.click(openRow());
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Notification unavailable',
  );
  expect(
    screen.queryByRole('button', { name: 'Retry marking as read' }),
  ).toBeNull();
});
it('explains attendance incidents whose detail UI is not implemented', async () => {
  const incident = {
    ...readNotification,
    source_type: 'attendance' as const,
    complaint_id: undefined,
    attendance_incident_id: row.complaint_id,
    kind: 'attendance_incident',
  };
  vi.mocked(listNotifications).mockResolvedValue(page([incident]));
  auth('warden');
  open();
  await screen.findByText(row.title);
  fireEvent.click(openRow());
  expect(
    screen.getByText(
      'Attendance incident details are not available in this portal yet.',
    ),
  ).toBeVisible();
  expect(screen.queryByRole('link', { name: /View related/ })).toBeNull();
  expect(markNotificationRead).not.toHaveBeenCalled();
});
it.each(['session', 'setup', 'forbidden'] as const)(
  'clears private inbox content after a %s write failure',
  async (kind) => {
    vi.mocked(markNotificationRead).mockRejectedValue(
      new NotificationError(kind, 'Access rejected'),
    );
    open();
    await screen.findByText(row.title);
    fireEvent.click(openRow());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Access rejected',
    );
    expect(screen.queryByText(row.title)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }));
    expect(signOut).toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Verify account access' }),
    );
    expect(await screen.findByText(row.title)).toBeVisible();
    expect(verify).toHaveBeenCalled();
  },
);
it('clears content when unread-count revalidation denies access', async () => {
  open();
  await screen.findByText(row.title);
  vi.mocked(getUnreadCount).mockRejectedValue(
    new NotificationError('forbidden', 'Access rejected'),
  );
  fireEvent(window, new Event('focus'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Access rejected');
  expect(screen.queryByText(row.title)).toBeNull();
});
it('aborts old reads and writes and discards private state on account change', async () => {
  let finish!: (v: typeof readNotification) => void;
  vi.mocked(markNotificationRead).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = open();
  await screen.findByText(row.title);
  fireEvent.click(openRow());
  const readSignal = vi.mocked(listNotifications).mock.calls[0][1];
  const writeSignal = vi.mocked(markNotificationRead).mock.calls[0][2];
  auth('student', 'other');
  vi.mocked(listNotifications).mockResolvedValue(page([]));
  view.rerender(
    <MemoryRouter>
      <NotificationsPage />
    </MemoryRouter>,
  );
  expect(readSignal.aborted).toBe(true);
  expect(writeSignal.aborted).toBe(true);
  expect(await screen.findByText('Your inbox is empty.')).toBeVisible();
  await act(async () => finish(readNotification));
  expect(screen.queryByText(row.title)).toBeNull();
});
it('returns no inbox when signed out and no badge during setup', () => {
  const value = vi.mocked(useAuth)();
  vi.mocked(useAuth).mockReturnValue({ ...value, account: null });
  const view = open(true);
  expect(screen.queryByRole('heading')).toBeNull();
  expect(getUnreadCount).not.toHaveBeenCalled();
  vi.mocked(useAuth).mockReturnValue({
    ...value,
    account: { ...account, setup_required: true },
  });
  view.rerender(
    <MemoryRouter>
      <NotificationBadge />
    </MemoryRouter>,
  );
  expect(screen.queryByRole('link')).toBeNull();
});
it('has an embedded student layout with one page heading supplied by the portal', async () => {
  render(
    <MemoryRouter>
      <NotificationsPage embedded />
    </MemoryRouter>,
  );
  expect(
    await screen.findByRole('heading', { name: 'Your inbox' }),
  ).toBeVisible();
  expect(
    within(screen.getByRole('region', { name: 'Inbox results' })).getByRole(
      'heading',
      { name: row.title },
    ),
  ).toBeVisible();
  expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
});
