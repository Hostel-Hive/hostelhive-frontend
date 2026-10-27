import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '../../../app/App';
import {
  restoreStaffSession,
  subscribeStaffSession,
} from '../../auth/api/auth.api';
import { getOwnProfile } from '../../student-portal/api/student-portal.api';
import { ownStudentProfile } from '../../../test/fixtures/ownStudentProfile';
import { exportReport, getReport } from '../api/reports.api';
import {
  reportFixture,
  reportFilters,
  reportID,
} from '../../../test/fixtures/reports';
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
vi.mock('../api/reports.api', async (original) => ({
  ...(await original<typeof import('../api/reports.api')>()),
  getReport: vi.fn(),
  exportReport: vi.fn(),
}));
const account = {
  user_id: reportID,
  firebase_uid: 'uid',
  email: 'staff@example.edu',
  role: 'admin' as const,
  is_active: true as const,
};
const paths = [
  '/dashboard/reports',
  '/dashboard/reports/daily',
  '/dashboard/reports/leaves',
  '/dashboard/reports/complaints',
];
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
  vi.mocked(getReport).mockImplementation(async (kind, _filters, offset) =>
    reportFixture(kind, offset),
  );
});
function at(path: string) {
  window.history.replaceState({}, '', path);
  return render(<App />);
}
it.each(['admin', 'warden'] as const)(
  'allows %s staff to run a report using protected navigation',
  async (role) => {
    vi.mocked(restoreStaffSession).mockResolvedValue({ ...account, role });
    at('/dashboard/reports');
    expect(
      await screen.findByRole('heading', { name: 'Reports' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Reports' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    fireEvent.change(screen.getByLabelText('From date'), {
      target: { value: reportFilters.from },
    });
    fireEvent.change(screen.getByLabelText('To date'), {
      target: { value: reportFilters.to },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run report' }));
    expect(await screen.findByRole('table')).toBeVisible();
    expect(getReport).toHaveBeenCalledWith(
      'attendance',
      reportFilters,
      0,
      'uid',
      expect.any(AbortSignal),
    );
    expect(exportReport).not.toHaveBeenCalled();
  },
);
it.each([
  ['/dashboard/reports/daily', 'Daily attendance'],
  ['/dashboard/reports/leaves', 'Leave requests'],
  ['/dashboard/reports/complaints', 'Complaints'],
])('supports direct route %s', async (path, title) => {
  at(path);
  expect(
    await screen.findByRole('heading', { name: title, level: 2 }),
  ).toBeVisible();
  expect(screen.getByRole('link', { name: 'Reports' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(getReport).not.toHaveBeenCalled();
});
it.each(paths)('redirects signed-out users from %s', async (path) => {
  vi.mocked(restoreStaffSession).mockResolvedValue(null);
  at(path);
  expect(
    await screen.findByRole('heading', { name: 'Sign in to HostelHive.' }),
  ).toBeVisible();
  expect(window.location.pathname).toBe('/staff/login');
  expect(getReport).not.toHaveBeenCalled();
  expect(exportReport).not.toHaveBeenCalled();
});
it.each(paths)('denies student access to %s', async (path) => {
  vi.mocked(restoreStaffSession).mockResolvedValue({
    ...account,
    role: 'student',
  });
  at(path);
  expect(
    await screen.findByRole('heading', { name: 'Welcome to HostelHive.' }),
  ).toBeVisible();
  expect(getReport).not.toHaveBeenCalled();
  expect(exportReport).not.toHaveBeenCalled();
});
