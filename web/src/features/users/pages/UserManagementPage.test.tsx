import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import UserManagementPage from './UserManagementPage';
import useAuth from '../../auth/hooks/useAuth';
import { changeUser, listUsers, UserManagementError } from '../api/users.api';
import {
  managedUser as user,
  managedUserPage as page,
} from '../../../test/fixtures/managedUsers';
vi.mock('../../auth/hooks/useAuth', () => ({ default: vi.fn() }));
vi.mock('../api/users.api', async (original) => ({
  ...(await original<typeof import('../api/users.api')>()),
  listUsers: vi.fn(),
  changeUser: vi.fn(),
}));
const list = vi.mocked(listUsers);
const change = vi.mocked(changeUser);
const retry = vi.fn();
const signOut = vi.fn();
function auth(
  role: 'admin' | 'warden' | 'student' = 'admin',
  uid = 'admin-uid',
) {
  vi.mocked(useAuth).mockReturnValue({
    account: {
      firebase_uid: uid,
      user_id: 'admin-id',
      email: 'admin@example.edu',
      role,
      is_active: true,
    },
    status: 'authenticated',
    busy: false,
    message: '',
    verifiedPath: '/dashboard/users',
    signIn: vi.fn(),
    signOut,
    retry,
  });
}
const show = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'showModal',
);
const close = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'close',
);
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value() {
      this.setAttribute('open', '');
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value() {
      this.removeAttribute('open');
    },
  });
});
afterAll(() => {
  if (show)
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', show);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  if (close) Object.defineProperty(HTMLDialogElement.prototype, 'close', close);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});
beforeEach(() => {
  vi.resetAllMocks();
  auth();
  retry.mockResolvedValue(undefined);
  signOut.mockResolvedValue(undefined);
  list.mockResolvedValue(page());
  change.mockResolvedValue({
    account: { ...user, role: 'warden' },
    revocationPending: false,
  });
});
const view = () => (
  <MemoryRouter initialEntries={['/dashboard/users']}>
    <UserManagementPage />
  </MemoryRouter>
);
const mount = (query = '') =>
  render(
    <MemoryRouter initialEntries={[`/dashboard/users${query}`]}>
      <UserManagementPage />
    </MemoryRouter>,
  );
async function open(kind = 'Change role') {
  const button = await screen.findByRole('button', {
    name: `${kind} for ${user.email}`
      .replace('Deactivate for ', 'Deactivate ')
      .replace('Activate for ', 'Activate '),
  });
  button.focus();
  fireEvent.click(button);
  return screen.getByRole('dialog');
}
it('loads real accounts with identity, role and status', async () => {
  mount();
  expect(screen.getByRole('status')).toHaveTextContent('Loading accounts');
  expect(
    await screen.findByRole('region', { name: 'User accounts' }),
  ).toHaveTextContent(user.email);
  expect(screen.getByText(user.full_name!)).toBeVisible();
  expect(screen.getByText('Active', { exact: true })).toBeVisible();
  expect(list).toHaveBeenCalledWith('admin-uid', expect.any(AbortSignal), 0);
});
it.each(['warden', 'student'] as const)(
  'denies %s before requesting data',
  (role) => {
    auth(role);
    mount();
    expect(screen.getByRole('alert')).toHaveTextContent('active Admin');
    expect(list).not.toHaveBeenCalled();
  },
);
it('denies an absent session', () => {
  vi.mocked(useAuth).mockReturnValue({ ...useAuth(), account: null });
  mount();
  expect(list).not.toHaveBeenCalled();
});
it('recovers an invalid URL to the first page', async () => {
  mount('?q=unsupported');
  expect(list).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Return to first page'));
  await screen.findByText(user.email);
  expect(list).toHaveBeenCalledTimes(1);
});
it('supports empty and later empty pages', async () => {
  list.mockResolvedValue(page([], 20));
  mount('?offset=20');
  expect(await screen.findByText(/No accounts on this page/)).toBeVisible();
  expect(screen.getByText('Previous')).toBeEnabled();
});
it('shows an empty first page', async () => {
  list.mockResolvedValue(page([]));
  mount();
  expect(await screen.findByText('No accounts found.')).toBeVisible();
  expect(screen.getByText('Next')).toBeDisabled();
});
it('paginates without inventing a total count', async () => {
  list
    .mockResolvedValueOnce(
      page(
        Array.from({ length: 20 }, (_, i) => ({
          ...user,
          user_id: String(i),
          firebase_uid: String(i),
        })),
        0,
        true,
      ),
    )
    .mockResolvedValueOnce(page([user], 20))
    .mockResolvedValueOnce(page());
  mount();
  fireEvent.click(await screen.findByText('Next'));
  await screen.findByText('Page 2');
  expect(list).toHaveBeenLastCalledWith(
    'admin-uid',
    expect.any(AbortSignal),
    20,
  );
  fireEvent.click(screen.getByText('Previous'));
  await screen.findByText('Page 1');
  expect(list).toHaveBeenLastCalledWith(
    'admin-uid',
    expect.any(AbortSignal),
    0,
  );
});
it('retries failed reads', async () => {
  list.mockRejectedValueOnce(new Error('Service unavailable'));
  mount();
  await screen.findByText('Service unavailable');
  fireEvent.click(screen.getByText('Retry accounts'));
  await screen.findByText(user.email);
});
it('refreshes manually', async () => {
  mount();
  await screen.findByText(user.email);
  fireEvent.click(screen.getByText('Refresh accounts'));
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
});
it('requires role selection and confirmation; cancellation restores focus', async () => {
  mount();
  const dialog = await open();
  expect(within(dialog).getByText('Cancel')).toHaveFocus();
  expect(within(dialog).getByText('Confirm change')).toBeDisabled();
  expect(within(dialog).getAllByRole('option')).toHaveLength(5);
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByText('Cancel'));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: `Change role for ${user.email}` }),
  ).toHaveFocus();
});
it('saves a role and refreshes confirmed server state', async () => {
  mount();
  const dialog = await open();
  fireEvent.change(within(dialog).getByLabelText('New role'), {
    target: { value: 'warden' },
  });
  list.mockResolvedValue(page([{ ...user, role: 'warden' }]));
  fireEvent.click(within(dialog).getByText('Confirm change'));
  await screen.findByText(/Role changed to Warden/);
  expect(change).toHaveBeenCalledWith(
    'admin-uid',
    expect.any(AbortSignal),
    user,
    { kind: 'role', role: 'warden' },
  );
  await waitFor(() =>
    expect(
      screen.getByRole('region', { name: 'User accounts' }),
    ).toHaveTextContent('Warden'),
  );
});
it.each([false, true])(
  'shows confirmed deactivation with pending=%s',
  async (pending) => {
    change.mockResolvedValue({
      account: { ...user, is_active: false },
      revocationPending: pending,
    });
    mount();
    const dialog = await open('Deactivate');
    expect(within(dialog).getByText(/does not archive/)).toBeVisible();
    fireEvent.click(within(dialog).getByText('Confirm change'));
    await screen.findByText(
      pending
        ? /deactivated locally.*still processing/
        : /Account deactivated\./,
    );
    expect(change.mock.calls[0][3]).toEqual({ kind: 'deactivate' });
  },
);
it('supports activation', async () => {
  list.mockResolvedValue(page([{ ...user, is_active: false }]));
  change.mockResolvedValue({ account: user, revocationPending: false });
  mount();
  const dialog = await open('Activate');
  fireEvent.click(within(dialog).getByText('Confirm change'));
  await screen.findByText(/Account activated/);
  expect(change.mock.calls[0][3]).toEqual({ kind: 'activate' });
});

it('warns about an archived profile before activation without performing restoration or allocation', async () => {
  list.mockResolvedValue(
    page([
      {
        ...user,
        is_active: false,
        student_profile_id: '11111111-1111-4111-8111-111111111111',
        student_profile_archived: true,
        student_has_active_bed: false,
      },
    ]),
  );
  change.mockResolvedValue({ account: user, revocationPending: false });
  mount();
  const dialog = await open('Activate');
  expect(
    within(dialog).getByText('This student profile is archived'),
  ).toBeVisible();
  expect(
    within(dialog).getByText('Accommodation is not assigned.'),
  ).toBeVisible();
  expect(
    within(dialog).getByRole('link', { name: 'Open archived students' }),
  ).toHaveAttribute('href', '/dashboard/students?status=archived');
  fireEvent.click(within(dialog).getByText('Confirm change'));
  expect(
    await screen.findByText(/Check Archived students to restore/),
  ).toBeVisible();
  expect(change.mock.calls[0][3]).toEqual({ kind: 'activate' });
});

it('explains that deactivation preserves the allocated bed', async () => {
  list.mockResolvedValue(
    page([
      {
        ...user,
        student_profile_id: '11111111-1111-4111-8111-111111111111',
        student_profile_archived: false,
        student_has_active_bed: true,
      },
    ]),
  );
  mount();
  const dialog = await open('Deactivate');
  expect(
    within(dialog).getByText(/Any allocated bed stays reserved/),
  ).toBeVisible();
  expect(
    within(dialog).getByText('This student currently has a reserved bed.'),
  ).toBeVisible();
  expect(
    within(dialog).getByText(/For a permanent departure, use End hostel stay/),
  ).toBeVisible();
  expect(change).not.toHaveBeenCalled();
});
it('blocks duplicate submission and Escape while pending', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof changeUser>>) => void;
  change.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  mount();
  const dialog = await open('Deactivate');
  const button = within(dialog).getByText('Confirm change');
  fireEvent.click(button);
  fireEvent.submit(button.closest('form')!);
  fireEvent(dialog, new Event('cancel', { bubbles: true, cancelable: true }));
  expect(change).toHaveBeenCalledTimes(1);
  expect(within(dialog).getByText('Cancel')).toBeDisabled();
  expect(dialog).toHaveAttribute('open');
  const unload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  await act(async () =>
    resolve({
      account: { ...user, is_active: false },
      revocationPending: false,
    }),
  );
});
it('explains last-admin conflicts without claiming success', async () => {
  change.mockRejectedValue(
    new UserManagementError(
      'conflict',
      'The last active Admin cannot be changed.',
    ),
  );
  mount();
  const dialog = await open('Deactivate');
  fireEvent.click(within(dialog).getByText('Confirm change'));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'last active Admin',
  );
  expect(dialog).toHaveAttribute('open');
  expect(screen.queryByText(/Account deactivated/)).not.toBeInTheDocument();
});
it.each([
  new UserManagementError('unavailable', 'Unavailable'),
  new Error('network'),
])('requires refresh after an uncertain outcome', async (error) => {
  change.mockRejectedValue(error);
  mount();
  const dialog = await open('Deactivate');
  fireEvent.click(within(dialog).getByText('Confirm change'));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'may already be saved',
  );
  expect(within(dialog).queryByText('Confirm change')).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByText('Close and refresh accounts'));
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  expect(change).toHaveBeenCalledTimes(1);
});
it('requires refresh for a removed account', async () => {
  change.mockRejectedValue(
    new UserManagementError('missing', 'Account no longer available.'),
  );
  mount();
  const dialog = await open('Deactivate');
  fireEvent.click(within(dialog).getByText('Confirm change'));
  await screen.findByText('Account no longer available.');
  fireEvent(dialog, new Event('cancel', { bubbles: true, cancelable: true }));
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
});
it('supports Escape cancellation without a mutation', async () => {
  mount();
  const dialog = await open();
  fireEvent(dialog, new Event('cancel', { bubbles: true, cancelable: true }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(change).not.toHaveBeenCalled();
});
it.each(['session', 'forbidden'] as const)(
  'clears private records after mutation %s',
  async (kind) => {
    change.mockRejectedValue(new UserManagementError(kind, 'Access denied'));
    mount();
    const dialog = await open('Deactivate');
    fireEvent.click(within(dialog).getByText('Confirm change'));
    await screen.findByText('Access denied');
    expect(screen.queryByText(user.email)).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Check access again'));
    await screen.findByText(user.email);
    expect(retry).toHaveBeenCalledTimes(1);
  },
);
it('clears rows after a denied refresh and supports sign-out recovery', async () => {
  mount();
  await screen.findByText(user.email);
  list.mockRejectedValue(new UserManagementError('forbidden', 'Denied'));
  fireEvent.click(screen.getByText('Refresh accounts'));
  await screen.findByText('Denied');
  expect(screen.queryByText(user.email)).not.toBeInTheDocument();
  signOut.mockRejectedValueOnce(new Error('network'));
  fireEvent.click(screen.getByText('Sign out'));
  await screen.findByText(/Sign out could not be confirmed/);
  fireEvent.click(screen.getByText('Sign out'));
  await waitFor(() => expect(signOut).toHaveBeenCalledTimes(2));
});
it('keeps records hidden when access verification fails', async () => {
  list.mockRejectedValue(new UserManagementError('session', 'Expired'));
  retry.mockRejectedValue(new Error('offline'));
  mount();
  fireEvent.click(await screen.findByText('Check access again'));
  await screen.findByText(/Access could not be verified/);
  expect(screen.queryByText(user.email)).not.toBeInTheDocument();
});
it('hides records after changing the current Admin account', async () => {
  list.mockResolvedValue(
    page([{ ...user, firebase_uid: 'admin-uid', role: 'admin' }]),
  );
  mount();
  const dialog = await open('Deactivate');
  change.mockResolvedValue({
    account: {
      ...user,
      firebase_uid: 'admin-uid',
      role: 'admin',
      is_active: false,
    },
    revocationPending: false,
  });
  expect(within(dialog).getByText(/your own account/)).toBeVisible();
  fireEvent.click(within(dialog).getByText('Confirm change'));
  await screen.findByText(/Your account access has changed/);
  expect(
    screen.queryByRole('region', { name: 'User accounts' }),
  ).not.toBeInTheDocument();
});
it('aborts reads and ignores stale responses when accounts change', async () => {
  let resolve!: (value: ReturnType<typeof page>) => void;
  list.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const rendered = render(view());
  const signal = list.mock.calls[0][1];
  auth('admin', 'another-admin');
  rendered.rerender(view());
  await screen.findByText(user.email);
  expect(signal.aborted).toBe(true);
  await act(async () =>
    resolve(page([{ ...user, email: 'stale@example.edu' }])),
  );
  expect(screen.queryByText('stale@example.edu')).not.toBeInTheDocument();
});
it('aborts an in-flight mutation on unmount', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof changeUser>>) => void;
  change.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const rendered = mount();
  const dialog = await open('Deactivate');
  fireEvent.click(within(dialog).getByText('Confirm change'));
  const signal = change.mock.calls[0][1];
  rendered.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () =>
    resolve({
      account: { ...user, is_active: false },
      revocationPending: false,
    }),
  );
  expect(list).toHaveBeenCalledTimes(1);
});
it('allows keyboard selection and cancellation', async () => {
  const keyboard = userEvent.setup();
  mount();
  await open('Deactivate');
  await keyboard.tab();
  expect(screen.getByText('Confirm change')).toHaveFocus();
  await keyboard.tab({ shift: true });
  await keyboard.keyboard('{Enter}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(change).not.toHaveBeenCalled();
});
