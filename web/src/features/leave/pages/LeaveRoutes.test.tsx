import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '../../../app/App';
import {
  restoreStaffSession,
  subscribeStaffSession,
} from '../../auth/api/auth.api';
import { listLeaves, getLeave } from '../api/leave.api';
import { leaveFixture, leavePage } from '../../../test/fixtures/leave';
vi.mock('../../auth/api/auth.api', async (original) => ({
  ...(await original<typeof import('../../auth/api/auth.api')>()),
  restoreStaffSession: vi.fn(),
  subscribeStaffSession: vi.fn(),
}));
vi.mock('../api/leave.api', async (original) => ({
  ...(await original<typeof import('../api/leave.api')>()),
  listLeaves: vi.fn(),
  getLeave: vi.fn(),
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
  vi.mocked(listLeaves).mockResolvedValue(leavePage());
  vi.mocked(getLeave).mockResolvedValue(leaveFixture);
  window.history.replaceState({}, '', '/dashboard/leaves');
});
it.each(['admin', 'warden'] as const)(
  'allows verified %s to browse read-only leave history',
  async (role) => {
    vi.mocked(restoreStaffSession).mockResolvedValue({ ...staff, role });
    window.history.replaceState(
      {},
      '',
      `/dashboard/leaves/${leaveFixture.leave_id}`,
    );
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'Recorded decision' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Approve request' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reject request' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Leave requests' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(getLeave).toHaveBeenCalledWith(
      leaveFixture.leave_id,
      'staff-uid',
      expect.any(AbortSignal),
    );
  },
);
it.each(['/dashboard/leaves', `/dashboard/leaves/${leaveFixture.leave_id}`])(
  'denies signed-out access to %s before fetching data',
  async (path) => {
    vi.mocked(restoreStaffSession).mockResolvedValue(null);
    window.history.replaceState({}, '', path);
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'Sign in to HostelHive.' }),
    ).toBeVisible();
    expect(listLeaves).not.toHaveBeenCalled();
    expect(getLeave).not.toHaveBeenCalled();
  },
);
it('loads the directory route for active staff', async () => {
  render(<App />);
  expect(await screen.findByRole('table')).toBeVisible();
  expect(listLeaves).toHaveBeenCalledWith(
    expect.any(URLSearchParams),
    'staff-uid',
    expect.any(AbortSignal),
  );
});
