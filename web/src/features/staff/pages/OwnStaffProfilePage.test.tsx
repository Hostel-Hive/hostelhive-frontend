import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import OwnStaffProfilePage from './OwnStaffProfilePage';
import useAuth from '../../auth/hooks/useAuth';
import { StaffError } from '../api/staff.api';
import { getOwnStaffProfile, updateOwnStaffName } from '../api/own-staff.api';
import {
  ownStaffAccount as account,
  ownStaffProfile as profile,
} from '../../../test/fixtures/ownStaff';
vi.mock('../../auth/hooks/useAuth', () => ({ default: vi.fn() }));
vi.mock('../api/own-staff.api', async (original) => ({
  ...(await original<typeof import('../api/own-staff.api')>()),
  getOwnStaffProfile: vi.fn(),
  updateOwnStaffName: vi.fn(),
}));
const verify = vi.fn();
const signOut = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  verify.mockResolvedValue(undefined);
  signOut.mockResolvedValue(undefined);
  vi.mocked(useAuth).mockReturnValue({
    account,
    retry: verify,
    signOut,
  } as unknown as ReturnType<typeof useAuth>);
  vi.mocked(getOwnStaffProfile).mockResolvedValue(profile);
  vi.mocked(updateOwnStaffName).mockResolvedValue({
    ...profile,
    full_name: 'Updated Name',
  });
});
function mount() {
  const router = createMemoryRouter([
    { path: '/', element: <OwnStaffProfilePage /> },
    { path: '/other', element: <p>Other page</p> },
  ]);
  return { ...render(<RouterProvider router={router} />), router };
}
async function edit() {
  await userEvent.click(
    await screen.findByRole('button', { name: 'Edit name' }),
  );
}
it.each(['admin', 'warden'] as const)(
  'shows %s self-service with read-only account fields',
  async (role) => {
    vi.mocked(useAuth).mockReturnValue({
      account: { ...account, role },
      retry: verify,
      signOut,
    } as unknown as ReturnType<typeof useAuth>);
    vi.mocked(getOwnStaffProfile).mockResolvedValue({ ...profile, role });
    mount();
    await edit();
    expect(screen.getByLabelText('Full name')).toBeVisible();
    expect(screen.queryByLabelText('Designation')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Role')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  },
);
it('does not request staff data for a Student', () => {
  vi.mocked(useAuth).mockReturnValue({
    account: { ...account, role: 'student' },
  } as unknown as ReturnType<typeof useAuth>);
  mount();
  expect(screen.getByRole('alert')).toHaveTextContent('Admins and Wardens');
  expect(getOwnStaffProfile).not.toHaveBeenCalled();
});
it('validates, saves only a name and revalidates the account menu projection', async () => {
  mount();
  await edit();
  await userEvent.clear(screen.getByLabelText('Full name'));
  await userEvent.click(screen.getByRole('button', { name: 'Save name' }));
  expect(screen.getByRole('alert')).toHaveTextContent('1–200');
  expect(updateOwnStaffName).not.toHaveBeenCalled();
  await userEvent.type(screen.getByLabelText('Full name'), 'Updated Name');
  await userEvent.click(screen.getByRole('button', { name: 'Save name' }));
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Your full name was updated',
  );
  expect(updateOwnStaffName).toHaveBeenCalledWith(
    expect.objectContaining({ user_id: account.user_id, role: 'warden' }),
    'Updated Name',
    expect.any(AbortSignal),
  );
  expect(verify).toHaveBeenCalledWith(true);
});
it('supports adding a name when no staff profile exists', async () => {
  vi.mocked(getOwnStaffProfile).mockResolvedValue({
    ...profile,
    full_name: '',
    designation: '',
  });
  mount();
  await userEvent.click(
    await screen.findByRole('button', { name: 'Add name' }),
  );
  await userEvent.type(screen.getByLabelText('Full name'), 'Updated Name');
  await userEvent.click(screen.getByRole('button', { name: 'Save name' }));
  await screen.findByRole('status');
  expect(updateOwnStaffName).toHaveBeenCalledTimes(1);
});
it('preserves an uncertain draft and checks the current name before another write', async () => {
  vi.mocked(updateOwnStaffName).mockRejectedValue(
    new StaffError('unavailable', 'Unknown'),
  );
  mount();
  await edit();
  await userEvent.clear(screen.getByLabelText('Full name'));
  await userEvent.type(screen.getByLabelText('Full name'), 'Updated Name');
  await userEvent.click(screen.getByRole('button', { name: 'Save name' }));
  await screen.findByRole('button', { name: 'Check current profile' });
  expect(screen.getByLabelText('Full name')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled();
  vi.mocked(getOwnStaffProfile).mockResolvedValue({
    ...profile,
    full_name: 'Updated Name',
  });
  await userEvent.click(
    screen.getByRole('button', { name: 'Check current profile' }),
  );
  expect(await screen.findByRole('status')).toHaveTextContent(
    'current saved name matches',
  );
  expect(updateOwnStaffName).toHaveBeenCalledTimes(1);
});
it('requires reviewing a different saved name after an uncertain update', async () => {
  vi.mocked(updateOwnStaffName).mockRejectedValue(
    new StaffError('unavailable', 'Unknown'),
  );
  mount();
  await edit();
  await userEvent.clear(screen.getByLabelText('Full name'));
  await userEvent.type(screen.getByLabelText('Full name'), 'Updated Name');
  await userEvent.click(screen.getByRole('button', { name: 'Save name' }));
  await screen.findByRole('button', { name: 'Check current profile' });
  vi.mocked(getOwnStaffProfile).mockResolvedValue({
    ...profile,
    full_name: 'Changed elsewhere',
  });
  await userEvent.click(
    screen.getByRole('button', { name: 'Check current profile' }),
  );
  await screen.findByText('Changed elsewhere');
  expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Use saved profile' }),
  );
  expect(await screen.findByRole('status')).toHaveTextContent('reloaded');
  expect(updateOwnStaffName).toHaveBeenCalledTimes(1);
});
it('clears private profile data after lost authority and offers account verification', async () => {
  vi.mocked(updateOwnStaffName).mockRejectedValue(
    new StaffError('forbidden', 'Staff access revoked'),
  );
  mount();
  await edit();
  await userEvent.clear(screen.getByLabelText('Full name'));
  await userEvent.type(screen.getByLabelText('Full name'), 'Updated Name');
  await userEvent.click(screen.getByRole('button', { name: 'Save name' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Staff access revoked',
  );
  expect(screen.queryByText(profile.designation)).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Verify account access' }),
  );
  expect(verify).toHaveBeenCalledWith(true);
});
it('protects unsaved drafts when cancelling or navigating away', async () => {
  const { router } = mount();
  await edit();
  await userEvent.type(screen.getByLabelText('Full name'), ' Draft');
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(
    screen.getByRole('region', { name: 'Unsaved profile changes' }),
  ).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  await act(async () => {
    await router.navigate('/other');
  });
  expect(
    screen.getByRole('region', { name: 'Unsaved profile changes' }),
  ).toBeVisible();
  await userEvent.click(
    screen.getByRole('button', { name: 'Discard changes' }),
  );
  expect(await screen.findByText('Other page')).toBeVisible();
});
it('prevents duplicate saves and aborts pending work on unmount', async () => {
  let finish!: (value: typeof profile) => void;
  vi.mocked(updateOwnStaffName).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = mount();
  await edit();
  await userEvent.clear(screen.getByLabelText('Full name'));
  await userEvent.type(screen.getByLabelText('Full name'), 'Updated Name');
  const save = screen.getByRole('button', { name: 'Save name' });
  fireEvent.click(save);
  fireEvent.click(save);
  expect(updateOwnStaffName).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  const signal = vi.mocked(updateOwnStaffName).mock.calls[0][2];
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => finish(profile));
});
it('retries transient reads without changing data', async () => {
  vi.mocked(getOwnStaffProfile).mockRejectedValueOnce(new Error('Network'));
  mount();
  await userEvent.click(
    await screen.findByRole('button', { name: 'Retry profile' }),
  );
  await screen.findByRole('button', { name: 'Edit name' });
  expect(updateOwnStaffName).not.toHaveBeenCalled();
});
