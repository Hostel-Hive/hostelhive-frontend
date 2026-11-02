import { render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '../../../app/App';
import {
  restoreStaffSession,
  subscribeStaffSession,
} from '../../auth/api/auth.api';
import { listDevices } from '../api/devices.api';
import { scannerPage } from '../../../test/fixtures/devices';
vi.mock('../../auth/api/auth.api', async (original) => ({
  ...(await original<typeof import('../../auth/api/auth.api')>()),
  restoreStaffSession: vi.fn(),
  subscribeStaffSession: vi.fn(),
}));
vi.mock('../api/devices.api', async (original) => ({
  ...(await original<typeof import('../api/devices.api')>()),
  listDevices: vi.fn(),
}));
vi.mock('../../dashboard/pages/WardenDashboardPage', () => ({
  default: () => <h1>Warden overview</h1>,
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(restoreStaffSession).mockResolvedValue({
    user_id: 'admin-id',
    firebase_uid: 'admin',
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
  vi.mocked(listDevices).mockResolvedValue(scannerPage);
  window.history.replaceState({}, '', '/dashboard/devices');
});
it('opens the Admin device route with active System navigation', async () => {
  render(<App />);
  expect(
    await screen.findByRole('heading', { name: 'Device management' }),
  ).toBeVisible();
  expect(
    within(
      screen.getByRole('navigation', { name: 'Primary navigation' }),
    ).getByRole('link', { name: 'Device management' }),
  ).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('heading', { name: 'System' })).toBeVisible();
});
it('redirects a Warden away from the route and hides the menu', async () => {
  vi.mocked(restoreStaffSession).mockResolvedValue({
    user_id: 'warden-id',
    firebase_uid: 'warden',
    email: 'warden@example.edu',
    role: 'warden',
    is_active: true,
  });
  render(<App />);
  expect(
    await screen.findByRole('heading', { name: 'Warden overview' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('link', { name: 'Device management' }),
  ).not.toBeInTheDocument();
  expect(listDevices).not.toHaveBeenCalled();
});
