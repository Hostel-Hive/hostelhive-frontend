import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import useAuth from '../../features/auth/hooks/useAuth';
import { getStaff } from '../../features/staff/api/staff.api';
import { staffProfile } from '../../test/fixtures/staffProfiles';
import StaffAccountMenu from './StaffAccountMenu';

vi.mock('../../features/auth/hooks/useAuth', () => ({ default: vi.fn() }));
vi.mock('../../features/staff/api/staff.api', () => ({ getStaff: vi.fn() }));
const signOut = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(useAuth).mockReturnValue({
    account: {
      user_id: staffProfile.user_id,
      firebase_uid: 'admin-uid',
      email: 'admin@example.edu',
      role: 'admin',
      is_active: true,
    },
    status: 'authenticated',
    busy: false,
    message: '',
    verifiedPath: '/dashboard/admin',
    signOut,
    signIn: vi.fn(),
    retry: vi.fn(),
  });
  vi.mocked(getStaff).mockResolvedValue({ ...staffProfile, role: 'admin' });
  signOut.mockResolvedValue(undefined);
});
function mount() {
  return render(
    <MemoryRouter>
      <StaffAccountMenu />
    </MemoryRouter>,
  );
}
it('loads the Admin name and links to their own staff profile', async () => {
  mount();
  fireEvent.click(
    await screen.findByRole('button', {
      name: `Account menu for ${staffProfile.full_name}`,
    }),
  );
  expect(screen.getByRole('menu', { name: 'Admin account' })).toBeVisible();
  expect(screen.getByRole('menuitem', { name: 'My profile' })).toHaveAttribute(
    'href',
    `/dashboard/staff/${staffProfile.user_id}`,
  );
  fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
  expect(signOut).toHaveBeenCalledTimes(1);
  await waitFor(() =>
    expect(
      screen.getByRole('button', {
        name: `Account menu for ${staffProfile.full_name}`,
      }),
    ).toBeEnabled(),
  );
});
it('keeps the account menu usable when no staff profile is available', async () => {
  vi.mocked(getStaff).mockRejectedValue(new Error('Missing profile'));
  mount();
  fireEvent.click(
    screen.getByRole('button', { name: 'Account menu for Admin account' }),
  );
  expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
});
it('does not expose Admin-only profile links to Warden', () => {
  const auth = vi.mocked(useAuth).getMockImplementation()!();
  vi.mocked(useAuth).mockReturnValue({
    ...auth,
    account: { ...auth.account!, role: 'warden' },
  });
  mount();
  const button = screen.getByRole('button', {
    name: 'Account menu for Warden account',
  });
  fireEvent.keyDown(button, { key: 'ArrowUp' });
  expect(screen.getByRole('menuitem', { name: 'Sign out' })).toHaveFocus();
  expect(
    screen.queryByRole('menuitem', { name: 'My profile' }),
  ).not.toBeInTheDocument();
  expect(getStaff).not.toHaveBeenCalled();
});
it('hides the control when signed out', () => {
  const auth = vi.mocked(useAuth).getMockImplementation()!();
  vi.mocked(useAuth).mockReturnValue({ ...auth, account: null });
  mount();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(getStaff).not.toHaveBeenCalled();
});
