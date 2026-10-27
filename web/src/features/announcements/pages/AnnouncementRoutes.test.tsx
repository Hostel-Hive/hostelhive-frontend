import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '../../../app/App';
import {
  restoreStaffSession,
  subscribeStaffSession,
} from '../../auth/api/auth.api';
import { getOwnProfile } from '../../student-portal/api/student-portal.api';
import {
  getAnnouncement,
  getAnnouncementSummary,
  listAnnouncements,
  publishAnnouncement,
} from '../api/announcements.api';
import {
  announcementFixture as row,
  announcementPage,
  summaryFixture,
} from '../../../test/fixtures/announcements';
import { ownStudentProfile } from '../../../test/fixtures/ownStudentProfile';
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
vi.mock('../api/announcements.api', async (original) => ({
  ...(await original<typeof import('../api/announcements.api')>()),
  getAnnouncement: vi.fn(),
  getAnnouncementSummary: vi.fn(),
  listAnnouncements: vi.fn(),
  publishAnnouncement: vi.fn(),
}));
const account = {
  user_id: row.published_by,
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
  vi.mocked(listAnnouncements).mockResolvedValue(announcementPage());
  vi.mocked(getAnnouncement).mockResolvedValue(row);
  vi.mocked(getAnnouncementSummary).mockResolvedValue(summaryFixture);
});
function at(path: string) {
  window.history.replaceState({}, '', path);
  return render(<App />);
}
it.each(['admin', 'warden'] as const)(
  'allows %s to publish using the staff route',
  async (role) => {
    vi.mocked(restoreStaffSession).mockResolvedValue({ ...account, role });
    at('/dashboard/announcements/new');
    expect(
      await screen.findByRole('button', { name: 'Review announcement' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Announcements' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(publishAnnouncement).not.toHaveBeenCalled();
  },
);
it.each(['admin', 'warden'] as const)(
  'allows %s to view announcements and backend delivery summary',
  async (role) => {
    vi.mocked(restoreStaffSession).mockResolvedValue({ ...account, role });
    at(`/dashboard/announcements/${row.announcement_id}`);
    expect(await screen.findByText('Original recipients')).toBeVisible();
    expect(screen.getByRole('heading', { name: row.title })).toBeVisible();
  },
);
it('provides staff feed navigation', async () => {
  at('/dashboard/announcements');
  expect(await screen.findByRole('link', { name: row.title })).toHaveAttribute(
    'href',
    `/dashboard/announcements/${row.announcement_id}`,
  );
  expect(screen.getByRole('link', { name: 'New announcement' })).toBeVisible();
});
it.each([
  '/student/announcements',
  `/student/announcements/${row.announcement_id}`,
])('provides read-only student route %s', async (path) => {
  vi.mocked(restoreStaffSession).mockResolvedValue({
    ...account,
    role: 'student',
  });
  at(path);
  if (path.endsWith(row.announcement_id))
    expect(
      await screen.findByRole('heading', { name: row.title }),
    ).toBeVisible();
  else
    expect(await screen.findByRole('link', { name: row.title })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Announcements' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(
    screen.queryByRole('link', { name: 'New announcement' }),
  ).not.toBeInTheDocument();
  expect(getAnnouncementSummary).not.toHaveBeenCalled();
});
it.each([
  '/dashboard/announcements',
  '/dashboard/announcements/new',
  `/dashboard/announcements/${row.announcement_id}`,
  '/student/announcements',
  `/student/announcements/${row.announcement_id}`,
])('protects signed-out direct route %s', async (path) => {
  vi.mocked(restoreStaffSession).mockResolvedValue(null);
  at(path);
  expect(
    await screen.findByRole('heading', { name: 'Sign in to HostelHive.' }),
  ).toBeVisible();
  expect(window.location.pathname).toBe(
    path.startsWith('/student') ? '/login' : '/staff/login',
  );
  expect(listAnnouncements).not.toHaveBeenCalled();
  expect(getAnnouncement).not.toHaveBeenCalled();
  expect(publishAnnouncement).not.toHaveBeenCalled();
});
it('rejects student access to staff publication routes', async () => {
  vi.mocked(restoreStaffSession).mockResolvedValue({
    ...account,
    role: 'student',
  });
  at('/dashboard/announcements/new');
  expect(
    await screen.findByRole('heading', { name: 'Welcome to HostelHive.' }),
  ).toBeVisible();
  expect(publishAnnouncement).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
});
it('rejects staff access through the student portal', async () => {
  at('/student/announcements');
  expect(
    await screen.findByRole('heading', { name: 'Admin dashboard' }),
  ).toBeVisible();
  expect(listAnnouncements).not.toHaveBeenCalled();
});
it('requires setup before student announcement reads', async () => {
  vi.mocked(restoreStaffSession).mockResolvedValue({
    ...account,
    role: 'student',
    setup_required: true,
  });
  at('/student/announcements');
  expect(
    await screen.findByRole('heading', { name: /Complete.*setup/i }),
  ).toBeVisible();
  expect(listAnnouncements).not.toHaveBeenCalled();
});
