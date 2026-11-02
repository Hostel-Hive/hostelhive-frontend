import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '../../../app/App';
import {
  restoreStaffSession,
  subscribeStaffSession,
} from '../../auth/api/auth.api';
import { getOwnStaffProfile, updateOwnStaffName } from '../api/own-staff.api';
import {
  ownStaffAccount as account,
  ownStaffProfile as profile,
} from '../../../test/fixtures/ownStaff';
vi.mock('../../auth/api/auth.api', async (original) => ({
  ...(await original<typeof import('../../auth/api/auth.api')>()),
  restoreStaffSession: vi.fn(),
  subscribeStaffSession: vi.fn(),
}));
vi.mock('../api/own-staff.api', async (original) => ({
  ...(await original<typeof import('../api/own-staff.api')>()),
  getOwnStaffProfile: vi.fn(),
  updateOwnStaffName: vi.fn(),
}));
vi.mock('../../student-portal/pages/StudentHomePage', () => ({
  default: () => <h1>Student portal</h1>,
}));
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
  vi.mocked(getOwnStaffProfile).mockResolvedValue(profile);
  vi.mocked(updateOwnStaffName).mockResolvedValue({
    ...profile,
    full_name: 'Updated Name',
  });
  window.history.replaceState({}, '', '/dashboard/profile');
});
it.each(['admin', 'warden'] as const)(
  'opens the personal profile for %s and links the account menu',
  async (role) => {
    vi.mocked(restoreStaffSession).mockResolvedValue({ ...account, role });
    vi.mocked(getOwnStaffProfile).mockResolvedValue({ ...profile, role });
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'My profile', level: 1 }),
    ).toBeVisible();
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Account menu for ' + account.full_name,
      }),
    );
    expect(
      screen.getByRole('menuitem', { name: 'My profile' }),
    ).toHaveAttribute('href', '/dashboard/profile');
  },
);
it('refreshes the displayed account-menu name after a successful self update', async () => {
  render(<App />);
  await userEvent.click(
    await screen.findByRole('button', { name: 'Edit name' }),
  );
  await userEvent.clear(screen.getByLabelText('Full name'));
  await userEvent.type(screen.getByLabelText('Full name'), 'Updated Name');
  vi.mocked(restoreStaffSession).mockResolvedValue({
    ...account,
    full_name: 'Updated Name',
  });
  await userEvent.click(screen.getByRole('button', { name: 'Save name' }));
  expect(
    await screen.findByRole('button', {
      name: 'Account menu for Updated Name',
    }),
  ).toBeVisible();
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Your full name was updated',
  );
  await waitFor(() => expect(restoreStaffSession).toHaveBeenCalledTimes(2));
});
it('redirects Students away without requesting staff self-service data', async () => {
  vi.mocked(restoreStaffSession).mockResolvedValue({
    ...account,
    role: 'student',
  });
  render(<App />);
  expect(
    await screen.findByRole('heading', { name: 'Student portal' }),
  ).toBeVisible();
  expect(getOwnStaffProfile).not.toHaveBeenCalled();
  expect(updateOwnStaffName).not.toHaveBeenCalled();
});
