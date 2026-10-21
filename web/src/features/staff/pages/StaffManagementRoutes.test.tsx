import { render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '../../../app/App';
import {
  restoreStaffSession,
  subscribeStaffSession,
} from '../../auth/api/auth.api';
import { getStaff, listStaff } from '../api/staff.api';
import { staffProfile, staffPage } from '../../../test/fixtures/staffProfiles';
vi.mock('../../auth/api/auth.api', async (original) => ({
  ...(await original<typeof import('../../auth/api/auth.api')>()),
  restoreStaffSession: vi.fn(),
  subscribeStaffSession: vi.fn(),
}));
vi.mock('../api/staff.api', async (original) => ({
  ...(await original<typeof import('../api/staff.api')>()),
  getStaff: vi.fn(),
  listStaff: vi.fn(),
}));
vi.mock('../../dashboard/pages/WardenDashboardPage', () => ({
  default: () => <h1>Warden overview</h1>,
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(restoreStaffSession).mockResolvedValue({
    user_id: 'admin-id',
    firebase_uid: 'admin-uid',
    email: 'admin@example.edu',
    role: 'admin',
    is_active: true,
  });
  vi.mocked(subscribeStaffSession).mockImplementation((change) => {
    let active = true;
    queueMicrotask(() => {
      if (active) change(true);
    });
    return () => {
      active = false;
    };
  });
  vi.mocked(getStaff).mockResolvedValue(staffProfile);
  vi.mocked(listStaff).mockResolvedValue(staffPage());
});
it.each([
  '/dashboard/staff',
  '/dashboard/staff/new',
  `/dashboard/staff/${staffProfile.user_id}`,
])(
  'renders guarded staff route %s with the active parent navigation link',
  async (path) => {
    window.history.replaceState({}, '', path);
    render(<App />);
    expect(
      await screen.findByRole('heading', {
        name:
          path === '/dashboard/staff'
            ? 'Staff management'
            : path.endsWith('/new')
              ? 'Add staff member'
              : 'Staff profile',
      }),
    ).toBeVisible();
    expect(
      within(
        screen.getByRole('navigation', { name: 'Primary navigation' }),
      ).getByRole('link', { name: 'Staff management' }),
    ).toHaveAttribute('aria-current', 'page');
  },
);
it.each([
  '/dashboard/staff',
  '/dashboard/staff/new',
  `/dashboard/staff/${staffProfile.user_id}`,
])('denies Warden access to %s without exposing staff data', async (path) => {
  vi.mocked(restoreStaffSession).mockResolvedValue({
    user_id: 'warden-id',
    firebase_uid: 'warden-uid',
    email: 'warden@example.edu',
    role: 'warden',
    is_active: true,
  });
  window.history.replaceState({}, '', path);
  render(<App />);
  await screen.findByRole('heading', { name: 'Warden overview' });
  expect(
    screen.queryByRole('link', { name: 'Staff management' }),
  ).not.toBeInTheDocument();
  expect(getStaff).not.toHaveBeenCalled();
  expect(listStaff).not.toHaveBeenCalled();
});
