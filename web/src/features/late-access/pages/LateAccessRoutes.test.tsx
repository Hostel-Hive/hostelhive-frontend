import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '../../../app/App';
import {
  restoreStaffSession,
  subscribeStaffSession,
} from '../../auth/api/auth.api';
import { listLateAccessRequests, getLateAccess } from '../api/late-access.api';
import {
  lateAccessFixture,
  lateAccessPage,
} from '../../../test/fixtures/late-access';
vi.mock('../../auth/api/auth.api', async (original) => ({
  ...(await original<typeof import('../../auth/api/auth.api')>()),
  restoreStaffSession: vi.fn(),
  subscribeStaffSession: vi.fn(),
}));
vi.mock('../api/late-access.api', async (original) => ({
  ...(await original<typeof import('../api/late-access.api')>()),
  listLateAccessRequests: vi.fn(),
  getLateAccess: vi.fn(),
}));
const staff = {
  user_id: 'staff',
  firebase_uid: 'staff-uid',
  email: 'staff@example.com',
  role: 'admin' as const,
  is_active: true as const,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(restoreStaffSession).mockResolvedValue(staff);
  vi.mocked(subscribeStaffSession).mockImplementation((change) => {
    let active = true;
    queueMicrotask(() => {
      if (active) change(true);
    });
    return () => {
      active = false;
    };
  });
  vi.mocked(listLateAccessRequests).mockResolvedValue(lateAccessPage());
  vi.mocked(getLateAccess).mockResolvedValue(lateAccessFixture);
  window.history.replaceState({}, '', '/dashboard/late-access-requests');
});
it.each(['admin', 'warden'] as const)(
  'allows verified %s to browse and decide leave',
  async (role) => {
    vi.mocked(restoreStaffSession).mockResolvedValue({ ...staff, role });
    window.history.replaceState(
      {},
      '',
      `/dashboard/late-access-requests/${lateAccessFixture.late_access_id}`,
    );
    render(<App />);
    expect(
      await screen.findByRole('button', { name: 'Approve request' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Reject request' }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Access requests' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(getLateAccess).toHaveBeenCalledWith(
      lateAccessFixture.late_access_id,
      'staff-uid',
      expect.any(AbortSignal),
    );
  },
);
it.each([
  '/dashboard/late-access-requests',
  `/dashboard/late-access-requests/${lateAccessFixture.late_access_id}`,
])('denies signed-out access to %s before fetching data', async (path) => {
  vi.mocked(restoreStaffSession).mockResolvedValue(null);
  window.history.replaceState({}, '', path);
  render(<App />);
  expect(
    await screen.findByRole('heading', { name: 'Sign in to HostelHive.' }),
  ).toBeVisible();
  expect(listLateAccessRequests).not.toHaveBeenCalled();
  expect(getLateAccess).not.toHaveBeenCalled();
});
it('loads the directory route for active staff', async () => {
  render(<App />);
  expect(await screen.findByRole('table')).toBeVisible();
  expect(listLateAccessRequests).toHaveBeenCalledWith(
    expect.any(URLSearchParams),
    'staff-uid',
    expect.any(AbortSignal),
  );
});
