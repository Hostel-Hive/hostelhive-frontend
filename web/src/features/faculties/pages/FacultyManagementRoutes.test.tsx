import { render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '../../../app/App';
import {
  restoreStaffSession,
  subscribeStaffSession,
} from '../../auth/api/auth.api';
import { listFaculties } from '../api/faculties.api';
import { facultyPage } from '../../../test/fixtures/faculties';
vi.mock('../../auth/api/auth.api', async (original) => ({
  ...(await original<typeof import('../../auth/api/auth.api')>()),
  restoreStaffSession: vi.fn(),
  subscribeStaffSession: vi.fn(),
}));
vi.mock('../api/faculties.api', async (original) => ({
  ...(await original<typeof import('../api/faculties.api')>()),
  listFaculties: vi.fn(),
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
  vi.mocked(listFaculties).mockResolvedValue(facultyPage);
  window.history.replaceState({}, '', '/dashboard/faculties');
});
it('opens the Admin faculty route with active System navigation', async () => {
  render(<App />);
  expect(
    await screen.findByRole('heading', { name: 'Faculty management' }),
  ).toBeVisible();
  expect(
    within(
      screen.getByRole('navigation', { name: 'Primary navigation' }),
    ).getByRole('link', { name: 'Faculties' }),
  ).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('heading', { name: 'System' })).toBeVisible();
});
it('allows Wardens to view the route without management actions', async () => {
  vi.mocked(restoreStaffSession).mockResolvedValue({
    user_id: 'warden-id',
    firebase_uid: 'warden',
    email: 'warden@example.edu',
    role: 'warden',
    is_active: true,
  });
  render(<App />);
  expect(
    await screen.findByRole('heading', { name: 'Faculty management' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: /Add faculty/ }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Faculties' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});
