import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '../../../app/App';
import {
  restoreStaffSession,
  subscribeStaffSession,
} from '../../auth/api/auth.api';
import { listUsers } from '../api/users.api';
import {
  managedUser,
  managedUserPage,
} from '../../../test/fixtures/managedUsers';
vi.mock('../../auth/api/auth.api', async (original) => ({
  ...(await original<typeof import('../../auth/api/auth.api')>()),
  restoreStaffSession: vi.fn(),
  subscribeStaffSession: vi.fn(),
}));
vi.mock('../api/users.api', async (original) => ({
  ...(await original<typeof import('../api/users.api')>()),
  listUsers: vi.fn(),
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
  vi.mocked(listUsers).mockResolvedValue(managedUserPage());
  window.history.replaceState({}, '', '/dashboard/users');
});
it('renders the Admin route in the shared layout with an active sidebar link', async () => {
  render(<App />);
  expect(
    await screen.findByRole('heading', { name: 'User management' }),
  ).toBeVisible();
  expect(screen.getByRole('link', { name: 'User management' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(screen.getByText('Staff workspace')).toBeVisible();
});
it('redirects Wardens and hides the Admin navigation link without loading accounts', async () => {
  vi.mocked(restoreStaffSession).mockResolvedValue({
    user_id: 'warden-id',
    firebase_uid: 'warden-uid',
    email: 'warden@example.edu',
    role: 'warden',
    is_active: true,
  });
  render(<App />);
  expect(
    await screen.findByRole('heading', { name: 'Warden overview' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('link', { name: 'User management' }),
  ).not.toBeInTheDocument();
  expect(listUsers).not.toHaveBeenCalled();
});
it('opens profile setup for an existing staff account without credentials in the URL', async () => {
  vi.mocked(listUsers).mockResolvedValue(
    managedUserPage([{ ...managedUser, role: 'warden' }]),
  );
  render(<App />);
  fireEvent.click(
    await screen.findByRole('link', {
      name: `Set up staff profile for ${managedUser.email}`,
    }),
  );
  expect(
    await screen.findByRole('heading', { name: 'Account confirmed' }),
  ).toBeVisible();
  expect(screen.queryByLabelText('Initial password')).not.toBeInTheDocument();
  expect(window.location.pathname).toBe('/dashboard/staff/new');
  expect(window.location.search).toBe('');
});
