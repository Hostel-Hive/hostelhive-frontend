import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  expect,
  it,
  vi,
} from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AuthContext, type AuthContextValue } from '../../auth/auth.context';
import StaffCreationPage from './StaffCreationPage';
import {
  provisionStaff,
  ProvisionError,
  writeStaffRecovery,
  readStaffRecovery,
} from '../api/staff-provisioning.api';
import { createStaffProfile, getStaff, StaffError } from '../api/staff.api';
import { listUsers, UserManagementError } from '../../users/api/users.api';
import { staffProfile as profile } from '../../../test/fixtures/staffProfiles';
vi.mock('../api/staff-provisioning.api', async (original) => ({
  ...(await original<typeof import('../api/staff-provisioning.api')>()),
  provisionStaff: vi.fn(),
}));
vi.mock('../api/staff.api', async (original) => ({
  ...(await original<typeof import('../api/staff.api')>()),
  getStaff: vi.fn(),
  createStaffProfile: vi.fn(),
}));
vi.mock('../../users/api/users.api', async (original) => ({
  ...(await original<typeof import('../../users/api/users.api')>()),
  listUsers: vi.fn(),
}));
const provision = vi.mocked(provisionStaff);
const get = vi.mocked(getStaff);
const create = vi.mocked(createStaffProfile);
const list = vi.mocked(listUsers);
const account = {
  user_id: profile.user_id,
  firebase_uid: 'created-staff',
  email: profile.email,
  role: 'warden' as const,
  is_active: true,
  full_name: profile.full_name,
  designation: profile.designation,
};
const password = 'original-password-83';
const verify = vi.fn();
const signOut = vi.fn();
let auth: AuthContextValue;
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
  sessionStorage.clear();
  auth = {
    account: {
      firebase_uid: 'admin',
      user_id: 'admin-id',
      email: 'admin@example.edu',
      role: 'admin',
      is_active: true,
    },
    status: 'authenticated',
    busy: false,
    message: '',
    verifiedPath: '/dashboard/staff/new',
    signIn: vi.fn(),
    signOut,
    retry: verify,
  };
  verify.mockResolvedValue(undefined);
  signOut.mockResolvedValue(undefined);
  provision.mockResolvedValue({ account, replayed: false });
  get.mockRejectedValue(new StaffError('missing', 'Not found'));
  create.mockResolvedValue(profile);
  list.mockResolvedValue({
    users: [account],
    limit: 20,
    offset: 0,
    has_more: false,
  });
});
afterEach(() => vi.restoreAllMocks());
function mount(state?: unknown) {
  const router = createMemoryRouter(
    [
      { path: '/dashboard/staff/new', element: <StaffCreationPage /> },
      {
        path: '/dashboard/staff',
        element: <h1>Staff directory destination</h1>,
      },
      { path: '/dashboard/users', element: <h1>User accounts destination</h1> },
      {
        path: '/dashboard/staff/:userID',
        element: <h1>Staff detail destination</h1>,
      },
    ],
    { initialEntries: [{ pathname: '/dashboard/staff/new', state }] },
  );
  const tree = () => (
    <AuthContext.Provider value={auth}>
      <RouterProvider router={router} />
    </AuthContext.Provider>
  );
  const view = render(tree());
  return { ...view, router, updateAuth: () => view.rerender(tree()) };
}
function fill() {
  for (const [label, value] of [
    ['Full name', profile.full_name],
    ['Designation', profile.designation],
    ['Email', profile.email],
    ['Initial password', password],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
const linked = () => ({ staffAccount: account, staffActor: 'admin' });
const start = () => {
  fill();
  fireEvent.click(screen.getByText('Create staff member'));
};
const ready = () =>
  screen.findByRole('heading', { name: 'Staff profile ready' });
it('shows four staff roles and an accessible password visibility control', () => {
  mount();
  expect(screen.getByLabelText('Initial password')).toHaveAttribute(
    'type',
    'password',
  );
  expect(screen.getAllByRole('option')).toHaveLength(4);
  fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
  expect(screen.getByLabelText('Initial password')).toHaveAttribute(
    'type',
    'text',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
  expect(screen.getByLabelText('Initial password')).toHaveAttribute(
    'type',
    'password',
  );
  expect(screen.getByText(/no setup invitation/)).toBeVisible();
});
it.each(['warden', 'student'] as const)(
  'denies %s before loading setup data',
  (role) => {
    auth = { ...auth, account: { ...auth.account!, role } };
    mount();
    expect(screen.getByRole('alert')).toHaveTextContent('active Admin');
    expect(list).not.toHaveBeenCalled();
  },
);
it('denies signed-out sessions', () => {
  auth = { ...auth, account: null };
  mount();
  expect(screen.getByRole('alert')).toHaveTextContent('active Admin');
});
it('validates input without creating an account', () => {
  mount();
  fireEvent.click(screen.getByText('Create staff member'));
  expect(screen.getByLabelText('Full name')).toHaveFocus();
  expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(4);
  expect(provision).not.toHaveBeenCalled();
});
it('creates the account then its missing profile and clears the recovery reference', async () => {
  mount();
  start();
  await ready();
  expect(provision).toHaveBeenCalledWith(
    { email: profile.email, role: 'warden', password },
    expect.any(String),
    'admin',
    expect.any(AbortSignal),
  );
  expect(get).toHaveBeenCalledWith(
    account.user_id,
    'admin',
    expect.any(AbortSignal),
  );
  expect(create).toHaveBeenCalledWith(
    account.user_id,
    { full_name: profile.full_name, designation: profile.designation },
    'admin',
    expect.any(AbortSignal),
  );
  expect(provision.mock.invocationCallOrder[0]).toBeLessThan(
    create.mock.invocationCallOrder[0],
  );
  expect(
    screen.getByRole('link', { name: 'View staff profile' }),
  ).toHaveAttribute('href', `/dashboard/staff/${account.user_id}`);
  expect(readStaffRecovery('admin')).toBeNull();
  expect(screen.queryByLabelText('Initial password')).not.toBeInTheDocument();
});
it('does not overwrite a profile that already exists', async () => {
  get.mockResolvedValue({ ...profile, full_name: 'Saved elsewhere' });
  mount();
  start();
  await screen.findByRole('heading', { name: 'Existing staff profile found' });
  expect(screen.getByText('Saved elsewhere')).toBeVisible();
  expect(create).not.toHaveBeenCalled();
});
it('creates a missing profile for an existing account without creating a login', async () => {
  mount(linked());
  fireEvent.click(screen.getByText('Complete staff profile'));
  await ready();
  expect(provision).not.toHaveBeenCalled();
  expect(create).toHaveBeenCalledTimes(1);
});
it('ignores linked account state supplied for another actor', () => {
  mount({ ...linked(), staffActor: 'another-admin' });
  expect(screen.getByLabelText('Email')).toBeVisible();
  expect(
    screen.queryByRole('heading', { name: 'Account confirmed' }),
  ).not.toBeInTheDocument();
});
it('paginates account choices and excludes student accounts', async () => {
  list
    .mockResolvedValueOnce({
      users: [{ ...account, role: 'student' }],
      limit: 20,
      offset: 0,
      has_more: true,
    })
    .mockResolvedValueOnce({
      users: [account],
      limit: 20,
      offset: 20,
      has_more: false,
    });
  mount();
  fireEvent.click(
    screen.getByRole('button', { name: 'Existing staff account' }),
  );
  await screen.findByText('No staff accounts on this page.');
  fireEvent.click(screen.getByText('Next accounts'));
  fireEvent.click(
    await screen.findByRole('button', { name: `Choose ${account.email}` }),
  );
  expect(
    screen.getByRole('heading', { name: 'Account confirmed' }),
  ).toBeVisible();
  expect(list).toHaveBeenLastCalledWith('admin', expect.any(AbortSignal), 20);
});
it('retries account choice failures', async () => {
  list.mockRejectedValueOnce(new Error('offline'));
  mount();
  fireEvent.click(
    screen.getByRole('button', { name: 'Existing staff account' }),
  );
  fireEvent.click(await screen.findByText('Retry account choices'));
  await screen.findByRole('button', { name: `Choose ${account.email}` });
});
it('retries an unconfirmed account with the original key and password', async () => {
  provision.mockRejectedValueOnce(
    new ProvisionError('unavailable', 'Original pending'),
  );
  mount();
  start();
  await screen.findByText('Original pending');
  const key = provision.mock.calls[0][1];
  expect(screen.getByLabelText('Email')).toBeDisabled();
  expect(screen.getByLabelText('Initial password')).toBeDisabled();
  expect(JSON.stringify(readStaffRecovery('admin'))).not.toContain(password);
  fireEvent.click(screen.getByText('Retry same account request'));
  await ready();
  expect(provision.mock.calls[1][1]).toBe(key);
  expect(provision.mock.calls[1][0].password).toBe(password);
});
it('restores an unconfirmed request after reload without storing the password', async () => {
  provision.mockRejectedValueOnce(new ProvisionError('unavailable', 'Pending'));
  const original = mount();
  start();
  await screen.findByText('Pending');
  const key = provision.mock.calls[0][1];
  original.unmount();
  mount();
  expect(screen.getByLabelText('Initial password')).toHaveValue('');
  fireEvent.change(screen.getByLabelText('Initial password'), {
    target: { value: password },
  });
  fireEvent.click(screen.getByText('Retry same account request'));
  await ready();
  expect(provision.mock.calls[1][1]).toBe(key);
});
it('retains the confirmed account through an uncertain profile save', async () => {
  create.mockRejectedValueOnce(new StaffError('unavailable', 'unknown'));
  mount();
  start();
  await screen.findByText(/The account exists. Profile setup is incomplete/);
  expect(screen.getByLabelText('Full name')).toBeDisabled();
  expect(readStaffRecovery('admin')?.account?.user_id).toBe(account.user_id);
  get.mockResolvedValue(profile);
  fireEvent.click(screen.getByText('Complete staff profile'));
  await screen.findByRole('heading', { name: 'Existing staff profile found' });
  expect(provision).toHaveBeenCalledTimes(1);
  expect(create).toHaveBeenCalledTimes(1);
});
it('resumes confirmed partial setup without another account request or password', async () => {
  writeStaffRecovery('admin', {
    key: 'partial-key-83',
    email: account.email,
    role: 'warden',
    full_name: profile.full_name,
    designation: profile.designation,
    account,
  });
  mount();
  expect(screen.queryByLabelText('Initial password')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Complete staff profile'));
  await ready();
  expect(provision).not.toHaveBeenCalled();
});
it('explains duplicate emails and requires confirmation to reset rejected account details', async () => {
  provision.mockRejectedValueOnce(
    new ProvisionError('conflict', 'Email already exists'),
  );
  mount();
  start();
  await screen.findByText('Email already exists');
  expect(create).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByText('Review account details and reset saved reference'),
  );
  fireEvent.click(screen.getByText('Continue'));
  expect(screen.getByLabelText('Email')).toBeEnabled();
  expect(readStaffRecovery('admin')).toBeNull();
  expect(provision).toHaveBeenCalledTimes(1);
});
it('does not restore a replayed account role or access status', async () => {
  provision.mockResolvedValue({
    account: { ...account, role: 'student', is_active: false },
    replayed: true,
  });
  mount();
  start();
  await screen.findByText(/confirmed account no longer has a staff role/);
  expect(create).not.toHaveBeenCalled();
  expect(screen.getByText('Complete staff profile')).toBeDisabled();
});
it('stops before account creation if safe recovery storage fails', async () => {
  mount();
  fill();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  fireEvent.click(screen.getByText('Create staff member'));
  await screen.findByText(/No new account request was started/);
  expect(provision).not.toHaveBeenCalled();
});
it('requires explicitly resetting corrupted recovery data', async () => {
  sessionStorage.setItem('hostelhive:staff-setup:admin', 'bad-json');
  mount();
  expect(screen.getByText('Create staff member')).toBeDisabled();
  fireEvent.click(
    screen.getByText('Review account details and reset saved reference'),
  );
  fireEvent.click(screen.getByText('Continue'));
  expect(screen.getByText('Create staff member')).toBeEnabled();
});
it('blocks duplicate submissions and pending navigation', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof provisionStaff>>) => void;
  provision.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const view = mount();
  fill();
  const button = screen.getByText('Create staff member');
  fireEvent.click(button);
  fireEvent.submit(button.closest('form')!);
  expect(provision).toHaveBeenCalledTimes(1);
  await act(async () => {
    await view.router.navigate('/dashboard/staff');
  });
  expect(screen.getByText('Keep working')).toBeDisabled();
  await act(async () => resolve({ account, replayed: false }));
  await ready();
});
it('protects dirty mode changes, route navigation and browser unload', async () => {
  const view = mount();
  fill();
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  fireEvent.click(
    screen.getByRole('button', { name: 'Existing staff account' }),
  );
  expect(screen.getByText('Keep working')).toHaveFocus();
  fireEvent.click(screen.getByText('Keep working'));
  expect(screen.getByLabelText('Email')).toHaveValue(account.email);
  await act(async () => {
    await view.router.navigate('/dashboard/staff');
  });
  fireEvent.click(screen.getByText('Continue'));
  await screen.findByText('Staff directory destination');
  expect(provision).not.toHaveBeenCalled();
});
it.each(['session', 'forbidden'] as const)(
  'hides setup data after %s',
  async (kind) => {
    provision.mockRejectedValue(
      new ProvisionError(kind, 'Admin access denied'),
    );
    mount();
    start();
    await screen.findByText('Admin access denied');
    expect(screen.queryByLabelText('Initial password')).not.toBeInTheDocument();
    verify.mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(screen.getByText('Check access again'));
    await screen.findByText(/Access could not be verified/);
    signOut.mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(screen.getByText('Sign out'));
    await screen.findByText(/Sign out could not be confirmed/);
  },
);
it('hides setup data if profile completion loses permission', async () => {
  create.mockRejectedValue(
    new StaffError('forbidden', 'Denied profile access'),
  );
  mount(linked());
  fireEvent.click(screen.getByText('Complete staff profile'));
  await screen.findByText('Denied profile access');
  expect(screen.queryByText(account.email)).not.toBeInTheDocument();
});
it('aborts an in-flight account request on actor change and ignores its late response', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof provisionStaff>>) => void;
  provision.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const view = mount();
  start();
  const signal = provision.mock.calls[0][3];
  auth = {
    ...auth,
    account: { ...auth.account!, firebase_uid: 'another-admin' },
  };
  view.updateAuth();
  expect(signal.aborted).toBe(true);
  expect(screen.getByLabelText('Initial password')).toHaveValue('');
  await act(async () => resolve({ account, replayed: false }));
  expect(create).not.toHaveBeenCalled();
});
it('aborts a pending profile request on unmount and ignores late failures', async () => {
  let reject!: (reason: Error) => void;
  create.mockReturnValue(
    new Promise((_, fail) => {
      reject = fail;
    }),
  );
  const view = mount(linked());
  fireEvent.click(screen.getByText('Complete staff profile'));
  await waitFor(() => expect(create).toHaveBeenCalled());
  const signal = create.mock.calls[0][3];
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => reject(new Error('late failure')));
});
it('preserves entered profile details when choosing an existing account', async () => {
  mount();
  fireEvent.click(
    screen.getByRole('button', { name: 'Existing staff account' }),
  );
  fireEvent.change(screen.getByLabelText('Full name'), {
    target: { value: 'Entered before selection' },
  });
  fireEvent.click(
    await screen.findByRole('button', { name: `Choose ${account.email}` }),
  );
  expect(screen.getByLabelText('Full name')).toHaveValue(
    'Entered before selection',
  );
});
it('supports previous account pages and a denied account-choice request', async () => {
  list
    .mockResolvedValueOnce({ users: [], limit: 20, offset: 0, has_more: true })
    .mockResolvedValueOnce({
      users: [],
      limit: 20,
      offset: 20,
      has_more: false,
    })
    .mockRejectedValueOnce(
      new UserManagementError('forbidden', 'Choice access denied'),
    );
  mount();
  fireEvent.click(
    screen.getByRole('button', { name: 'Existing staff account' }),
  );
  await screen.findByText('Account page 1');
  fireEvent.click(screen.getByText('Next accounts'));
  await screen.findByText('Account page 2');
  fireEvent.click(screen.getByText('Previous accounts'));
  await screen.findByText('Choice access denied');
});
it('preserves editable fields after a known profile validation rejection', async () => {
  create.mockRejectedValueOnce(
    new StaffError('invalid', 'Profile values rejected'),
  );
  mount(linked());
  fireEvent.click(screen.getByText('Complete staff profile'));
  await screen.findByText(/Profile values rejected/);
  expect(screen.getByLabelText('Full name')).toBeEnabled();
  fireEvent.change(screen.getByLabelText('Designation'), {
    target: { value: 'Corrected designation' },
  });
  create.mockResolvedValue({
    ...profile,
    designation: 'Corrected designation',
  });
  fireEvent.click(screen.getByText('Complete staff profile'));
  await ready();
  expect(provision).not.toHaveBeenCalled();
});
it('cancels the unsaved-work warning with Escape and supports confirmed mode switching', async () => {
  mount();
  fill();
  fireEvent.click(
    screen.getByRole('button', { name: 'Existing staff account' }),
  );
  fireEvent(
    screen.getByRole('alertdialog'),
    new Event('cancel', { bubbles: true, cancelable: true }),
  );
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Existing staff account' }),
  );
  fireEvent.click(screen.getByText('Continue'));
  await screen.findByRole('button', { name: `Choose ${account.email}` });
  expect(screen.queryByLabelText('Initial password')).not.toBeInTheDocument();
});
it('ignores a stale account-choice failure after unmount', async () => {
  let reject!: (reason: Error) => void;
  list.mockReturnValueOnce(
    new Promise((_, fail) => {
      reject = fail;
    }),
  );
  const view = mount();
  fireEvent.click(
    screen.getByRole('button', { name: 'Existing staff account' }),
  );
  const signal = list.mock.calls[0][1];
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => reject(new Error('late failure')));
});
it('restores an older pending request instead of replacing it when switching from an existing account', async () => {
  const recovery = {
    key: 'older-request-key-83',
    email: 'pending@example.edu',
    role: 'admin' as const,
    full_name: 'Pending Admin',
    designation: 'Administrator',
  };
  writeStaffRecovery('admin', recovery);
  mount(linked());
  fireEvent.click(screen.getByRole('button', { name: 'New staff account' }));
  fireEvent.click(screen.getByText('Continue'));
  expect(screen.getByLabelText('Email')).toHaveValue(recovery.email);
  expect(screen.getByLabelText('Email')).toBeDisabled();
  expect(screen.getByLabelText('Initial password')).toHaveValue('');
  expect(screen.getByText('Retry same account request')).toBeVisible();
  expect(readStaffRecovery('admin')?.key).toBe(recovery.key);
  expect(provision).not.toHaveBeenCalled();
});
